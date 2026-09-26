import type { NextRequest } from "next/server";

export function allowedBrowseTarget(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0" || host === "::1" || host === "[::1]") return null;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
    return null;
  }
  return url;
}

const PORTAL_ROUTE_PREFIXES = [
  "/login",
  "/signup",
  "/endpoints",
  "/jobs",
  "/keys",
  "/usage",
  "/docs",
  "/catalog",
  "/studio",
  "/run",
  "/home",
  "/repairs",
  "/sessions",
  "/admin",
  "/api/",
];

/** Portal pages must not be hijacked when a stray `u=` query appears. */
export function isProtectedPortalPath(pathname: string): boolean {
  if (pathname === "/") return false;
  return PORTAL_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

/** Build upstream URL from mirrored iframe path + `u` site root param. */
export function resolveMirroredUpstream(request: NextRequest): URL | null {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/api/browse") return null;

  const u = request.nextUrl.searchParams.get("u");
  if (!u) return null;

  const seed = allowedBrowseTarget(u);
  if (!seed) return null;

  const upstream = new URL(pathname || "/", seed.origin);
  const sp = new URLSearchParams(request.nextUrl.search);
  sp.delete("u");
  sp.forEach((value, key) => {
    upstream.searchParams.append(key, value);
  });
  return upstream;
}

/** Iframe and asset URLs: keep the browser pathname aligned with the target site. */
export function mirrorBrowseHref(target: string, portalOrigin?: string): string {
  const absolute = allowedBrowseTarget(target);
  if (!absolute) {
    const legacy = `/api/browse?u=${encodeURIComponent(target)}`;
    return portalOrigin ? `${portalOrigin.replace(/\/$/, "")}${legacy}` : legacy;
  }
  const siteRoot = `${absolute.origin}/`;
  const path = `${absolute.pathname}${absolute.search}`;
  const join = path.includes("?") ? "&" : "?";
  const mirror = `${path}${join}u=${encodeURIComponent(siteRoot)}`;
  return portalOrigin ? `${portalOrigin.replace(/\/$/, "")}${mirror}` : mirror;
}
