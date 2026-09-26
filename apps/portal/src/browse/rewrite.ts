/** Rewrite third-party asset URLs so iframe loads go through /api/browse (same origin). */

export function isApiLikeBrowsePath(target: URL): boolean {
  const path = target.pathname;
  return /\/api(?:\/|$)/i.test(path) || path.endsWith(".json");
}

/** Upstream APIs sometimes use text/html while returning JSON; do not inject browse scripts into those bodies. */
export function shouldPassThroughBrowseBody(target: URL, contentType: string, body: string): boolean {
  if (contentType.includes("json")) return true;
  if (isApiLikeBrowsePath(target)) return true;
  const head = body.trimStart().slice(0, 1);
  return head === "{" || head === "[";
}

/** Node fetch often gets HTTP 404 for JSON APIs that still return a parseable body; Angular needs 200 to continue. */
export function normalizeTeachApiBrowseResponse(
  target: URL,
  status: number,
  body: string,
): { status: number; body: string; contentType?: string } {
  if (!isApiLikeBrowsePath(target)) return { status, body };
  if (status < 400) return { status, body };
  const trim = body.trimStart();
  if (!trim.startsWith("{") && !trim.startsWith("[")) return { status, body };
  try {
    JSON.parse(body);
  } catch {
    return { status, body };
  }
  return { status: 200, body, contentType: "application/json; charset=utf-8" };
}

const TEACH_STRIP_SCRIPT =
  /\b(cookieyes|googletagmanager|googleoptimize|optimize\.google|northbeam|clarity\.ms|hotjar|doubleclick|fbevents|tiktok\.com|taboola|outbrain|snap\.licdn\.com)\b/i;

const INLINE_TRACKER_QUEUE_STUB =
  "<script>window.__inlineTrackers=window.__inlineTrackers||[];window.__loadInlineTrackers=window.__loadInlineTrackers||function(){};</script>";

/** Drop consent/analytics scripts that throw or spam the console when the page runs on localhost teach preview. */
export function stripTeachTrackerScripts(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (tag) => {
    if (TEACH_STRIP_SCRIPT.test(tag)) return "<!-- shadow: stripped tracker -->";
    if (/\bGTM-[A-Z0-9]+\b/.test(tag) && /\bgoogletagmanager\b/i.test(tag)) return "<!-- shadow: stripped tracker -->";
    if (/__loadInlineTrackers/.test(tag)) return INLINE_TRACKER_QUEUE_STUB;
    if (/__inlineTrackers\.push\s*\(/.test(tag) && TEACH_STRIP_SCRIPT.test(tag)) return "<!-- shadow: stripped tracker -->";
    return tag;
  });
}

export function proxyHref(target: string, portalOrigin?: string): string {
  const path = `/api/browse?u=${encodeURIComponent(target)}`;
  if (!portalOrigin) return path;
  return `${portalOrigin.replace(/\/$/, "")}${path}`;
}

/** SPA servers return index.html for unknown paths; recover real static files. */
export function spaStaticAssetFallbackUrls(requested: URL): URL[] {
  const parts = requested.pathname.split("/").filter(Boolean);
  const leaf = parts[parts.length - 1];
  if (!leaf || !/\.(m?js|css|map|woff2?|ttf|eot|svg|png|jpe?g|webp|gif)(\?|$)/i.test(leaf)) return [];

  const out: URL[] = [];
  const push = (path: string) => {
    try {
      const url = new URL(path, requested.origin);
      if (url.href !== requested.href) out.push(url);
    } catch {
      /* ignore */
    }
  };

  push(`/${leaf}`);

  const staticDirs = ["assets", "static", "dist", "build", "public", "media"];
  for (const dir of staticDirs) {
    const idx = parts.indexOf(dir);
    if (idx >= 0) push(`/${parts.slice(idx).join("/")}`);
  }

  const seen = new Set<string>();
  return out.filter((url) => {
    if (seen.has(url.href)) return false;
    seen.add(url.href);
    return true;
  });
}

/** @deprecated use spaStaticAssetFallbackUrls */
export function rootFallbackAssetUrl(requested: URL): URL | null {
  return spaStaticAssetFallbackUrls(requested)[0] ?? null;
}

/** Relative script/link URLs follow `<base href>`, not the browsed route (e.g. /product/…). */
export function readDocumentBase(html: string, page: URL): URL {
  const match = html.match(/<base\b[^>]*\shref=("([^"]*)"|'([^']*)')/i);
  const raw = match?.[2] ?? match?.[3];
  if (!raw) return new URL("/", page.origin);
  try {
    return new URL(raw, page);
  } catch {
    return new URL("/", page.origin);
  }
}

export function rewriteUrl(raw: string, base: URL, portalOrigin?: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("data:") || trimmed.startsWith("mailto:") || trimmed.startsWith("javascript:")) {
    return null;
  }
  try {
    const absolute = new URL(trimmed, base).toString();
    const host = new URL(absolute).hostname;
    if (/^(fonts\.gstatic\.com|fonts\.googleapis\.com|applepay\.cdn-apple\.com|widget\.trustpilot\.com)$/i.test(host)) {
      return absolute;
    }
    return proxyHref(absolute, portalOrigin);
  } catch {
    return null;
  }
}

function rewriteCssUrlsInText(css: string, base: URL, portalOrigin?: string): string {
  return css.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi, (match, path: string) => {
    const next = rewriteUrl(path, base, portalOrigin);
    return next ? `url("${next}")` : match;
  });
}

/** Root-relative url(/…) in proxied CSS must resolve against the real site origin, not localhost. */
export function rewriteCss(css: string, sheetUrl: URL, portalOrigin?: string): string {
  const sheetBase = new URL(sheetUrl.origin + "/");
  let out = rewriteCssUrlsInText(css, sheetBase, portalOrigin);
  out = out.replace(
    /@import\s+(?:url\(\s*)?['"]([^'"]+)['"]\s*\)?/gi,
    (match, path: string) => {
      const next = rewriteUrl(path, sheetBase, portalOrigin);
      return next ? `@import url("${next}")` : match;
    },
  );
  return out;
}

function rewriteAttrValue(attr: string, value: string, page: URL, portalOrigin?: string): string {
  if (attr.toLowerCase() === "srcset") {
    return value
      .split(",")
      .map((part) => {
        const trimmed = part.trim();
        const space = trimmed.search(/\s/);
        const urlPart = space === -1 ? trimmed : trimmed.slice(0, space);
        const rest = space === -1 ? "" : trimmed.slice(space);
        const next = rewriteUrl(urlPart, page, portalOrigin);
        return next ? `${next}${rest}` : part;
      })
      .join(", ");
  }
  return rewriteUrl(value, page, portalOrigin) ?? value;
}

function rewriteAttributes(chunk: string, page: URL, portalOrigin?: string): string {
  return chunk.replace(/\s(href|src|action|srcset)=("([^"]*)"|'([^']*)')/gi, (_match, attr: string, _q: string, d?: string, s?: string) => {
    const original = d ?? s ?? "";
    const next = rewriteAttrValue(attr, original, page, portalOrigin);
    const quote = d !== undefined ? '"' : "'";
    return ` ${attr}=${quote}${next}${quote}`;
  });
}

function rewriteBaseHref(html: string, documentBase: URL): string {
  const absolute = documentBase.toString();
  return html.replace(/<base\b([^>]*)>/gi, (_match, attrs: string) => {
    const hrefMatch = attrs.match(/\shref=("([^"]*)"|'([^']*)')/i);
    const quote = hrefMatch?.[2] !== undefined ? '"' : "'";
    const withoutHref = attrs.replace(/\shref=("([^"]*)"|'([^']*)')/i, "");
    return `<base href=${quote}${absolute}${quote}${withoutHref}>`;
  });
}

function rewriteScriptOpenTags(html: string, page: URL, portalOrigin?: string): string {
  return html.replace(/<script\b([^>]*)>/gi, (_match, attrs: string) => {
    let next = rewriteAttributes(attrs, page, portalOrigin);
    next = next.replace(/\scrossorigin=(['"])[^'"]*\1/gi, "");
    return `<script${next}>`;
  });
}

function rewriteStyleTags(html: string, base: URL, portalOrigin?: string): string {
  return html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open: string, css: string, close: string) => {
    return `${open}${rewriteCssUrlsInText(css, base, portalOrigin)}${close}`;
  });
}

export function rewriteHtml(html: string, page: URL, injectHead: string, portalOrigin?: string): string {
  const cleaned = stripTeachTrackerScripts(html);
  const documentBase = readDocumentBase(cleaned, page);
  const parts = cleaned.split(/(<script\b[^>]*>[\s\S]*?<\/script>)/gi);
  const rewritten = parts
    .map((part, index) => {
      if (index % 2 === 1) return rewriteScriptOpenTags(part, documentBase, portalOrigin);
      return rewriteAttributes(part, documentBase, portalOrigin);
    })
    .join("");
  const withBase = rewriteBaseHref(rewritten, documentBase);
  const withStyles = rewriteStyleTags(withBase, documentBase, portalOrigin);
  if (withStyles.includes("<head")) return withStyles.replace(/<head[^>]*>/i, (head) => `${head}${injectHead}`);
  return injectHead + withStyles;
}
