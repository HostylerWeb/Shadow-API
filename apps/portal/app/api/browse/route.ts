import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  normalizeTeachApiBrowseResponse,
  rewriteCss,
  rewriteHtml,
  rootFallbackAssetUrl,
  shouldPassThroughBrowseBody,
  spaStaticAssetFallbackUrls,
} from "../../../src/browse/rewrite";
import { resolveMirroredUpstream } from "../../../src/browse/browse-mirror";
import { browseProxyClientScript } from "../../../src/browse/proxy-client-script";
import { readSession } from "../../../src/session";
import { teachInjectScript } from "../../../src/teach/inject-script";

export const dynamic = "force-dynamic";

const DROP = [
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
];

const BROWSE_POLICY = "unload=(self)";

function allowedTarget(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0" || host === "::1" || host === "[::1]") return null;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return null;
  return url;
}

/** Clicks inside the frame often come back as this portal. Pull the real website out of those addresses. */
function publicTarget(raw: string, portal: URL): URL | null {
  let current = raw.trim();
  if (current && !/^[a-z][a-z0-9+.-]*:/i.test(current)) current = `https://${current}`;
  for (let hop = 0; hop < 5; hop += 1) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return null;
    }
    const nested = parsed.searchParams.get("u") ?? parsed.searchParams.get("url");
    const ownHost = parsed.hostname === portal.hostname || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (ownHost && nested) {
      current = nested;
      continue;
    }
    return allowedTarget(parsed.toString());
  }
  return null;
}

function injectHeadScripts(page: URL, portalOrigin: string): string {
  const teachScript = `<script>${teachInjectScript(page.toString())}</script>`;
  const proxyClient = `<script>${browseProxyClientScript(page.toString(), portalOrigin)}</script>`;
  return `<script>document.documentElement.setAttribute("data-shadow-url", ${JSON.stringify(page.toString())});</script>
${proxyClient}
${teachScript}`;
}

function upstreamRequestHeaders(request: NextRequest): HeadersInit {
  return {
    "user-agent":
      request.headers.get("user-agent") ??
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    accept: request.headers.get("accept") ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  };
}

async function fetchUpstream(target: URL, request: NextRequest) {
  return fetch(target, {
    method: request.method === "POST" ? "POST" : "GET",
    headers: upstreamRequestHeaders(request),
    body: request.method === "POST" ? await request.arrayBuffer() : undefined,
    redirect: "follow",
  }).catch((err: unknown) => {
    const nested = err instanceof Error && err.cause instanceof Error ? err.cause : null;
    const code = nested && "code" in nested ? String((nested as NodeJS.ErrnoException).code) : "";
    const detail = nested?.message ?? (err instanceof Error ? err.message : String(err));
    console.error(`[browse] upstream fetch failed host=${target.hostname} ${code || detail}`);
    return null;
  });
}

async function handle(request: NextRequest) {
  const token = (await cookies()).get("portal_session")?.value;
  if (!readSession(token)) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const target =
    resolveMirroredUpstream(request) ??
    publicTarget(request.nextUrl.searchParams.get("u") ?? "", request.nextUrl);
  if (!target) {
    const html = `<!doctype html><html><body style="font-family:sans-serif;padding:1.5rem"><p>This link stayed inside ShadowAPI instead of opening the website.</p><p>Use the address bar in the box, or go back and enter the website address again.</p></body></html>`;
    return new NextResponse(html, { status: 400, headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const upstream = await fetchUpstream(target, request);

  if (!upstream) {
    return new NextResponse(
      browseErrorHtml(
        "Could not reach this site",
        `ShadowAPI could not open ${target.hostname}. From this server the HTTPS connection was refused or reset before any page was returned (common for bot protection, geo blocks, or adult sites). This is not a portal bug — try a site that loads in curl from your network, or teach from a URL that allows your worker IP.`,
      ),
      { status: 502, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  const type = upstream.headers.get("content-type") ?? "application/octet-stream";
  const headers = new Headers();
  headers.set("content-type", type);
  headers.set("cache-control", "no-store");
  headers.set("Permissions-Policy", BROWSE_POLICY);
  for (const name of DROP) headers.delete(name);

  let resolved = new URL(upstream.url);
  let effectiveUpstream = upstream;
  let effectiveType = type;

  const fallbacks = spaStaticAssetFallbackUrls(target);
  if (fallbacks.length > 0 && type.includes("text/html")) {
    for (const candidate of fallbacks) {
      const retry = await fetchUpstream(candidate, request);
      const retryType = retry?.headers.get("content-type") ?? "";
      if (retry && !retryType.includes("text/html")) {
        effectiveUpstream = retry;
        effectiveType = retryType;
        resolved = new URL(retry.url);
        headers.set("content-type", retryType);
        break;
      }
    }
  }

  const portalOrigin = request.nextUrl.origin;

  if (effectiveType.includes("text/html")) {
    const page = resolved;
    let rawHtml: string;
    try {
      rawHtml = await effectiveUpstream.text();
    } catch {
      return new NextResponse(
        browseErrorHtml("Could not read page", `The response from ${target.hostname} could not be read.`),
        { status: 502, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
    if (!effectiveUpstream.ok && rawHtml.length < 64) {
      return new NextResponse(
        browseErrorHtml(
          "Site returned an error",
          `${target.hostname} responded with HTTP ${effectiveUpstream.status}. Some sites block proxy or teach previews.`,
        ),
        { status: effectiveUpstream.status >= 400 ? effectiveUpstream.status : 502, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
    if (shouldPassThroughBrowseBody(resolved, effectiveType, rawHtml)) {
      const normalized = normalizeTeachApiBrowseResponse(resolved, effectiveUpstream.status, rawHtml);
      const passHeaders = new Headers(headers);
      const trimmed = normalized.body.trimStart();
      if (normalized.contentType) passHeaders.set("content-type", normalized.contentType);
      else if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && !effectiveType.includes("json")) {
        passHeaders.set("content-type", "application/json; charset=utf-8");
      }
      return new NextResponse(normalized.body, { status: normalized.status, headers: passHeaders });
    }
    try {
      const html = rewriteHtml(rawHtml, page, injectHeadScripts(page, portalOrigin), portalOrigin);
      return new NextResponse(html, { status: effectiveUpstream.status, headers });
    } catch {
      return new NextResponse(
        browseErrorHtml("Could not prepare preview", `ShadowAPI could not rewrite HTML from ${target.hostname}.`),
        { status: 500, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
  }
  if (effectiveType.includes("text/css") || effectiveType.includes("application/javascript") || effectiveType.includes("text/javascript")) {
    const text = await effectiveUpstream.text();
    const body = effectiveType.includes("text/css") ? rewriteCss(text, resolved, portalOrigin) : text;
    return new NextResponse(body, { status: effectiveUpstream.status, headers });
  }
  if (effectiveType.includes("font/") || effectiveType.includes("image/")) {
    return new NextResponse(await effectiveUpstream.arrayBuffer(), { status: effectiveUpstream.status, headers });
  }
  const raw = await effectiveUpstream.text();
  if (shouldPassThroughBrowseBody(resolved, effectiveType, raw)) {
    const normalized = normalizeTeachApiBrowseResponse(resolved, effectiveUpstream.status, raw);
    const passHeaders = new Headers(headers);
    if (normalized.contentType) passHeaders.set("content-type", normalized.contentType);
    return new NextResponse(normalized.body, { status: normalized.status, headers: passHeaders });
  }
  return new NextResponse(raw, { status: effectiveUpstream.status, headers });
}

export function GET(request: NextRequest) {
  return handle(request);
}

export function POST(request: NextRequest) {
  return handle(request);
}
