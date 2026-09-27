import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPortalPath, resolveMirroredUpstream } from "./src/browse/browse-mirror";

function teachAllowHostFromUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);

  if (request.nextUrl.pathname === "/endpoints/new/record") {
    const title = request.nextUrl.searchParams.get("title")?.trim();
    const description = request.nextUrl.searchParams.get("description")?.trim();
    const url = request.nextUrl.searchParams.get("url")?.trim();
    if (title && description && url) {
      const host = teachAllowHostFromUrl(url);
      if (!host) {
        return NextResponse.redirect(new URL("/endpoints/new?error=url", request.url));
      }
      const response = NextResponse.next({ request: { headers } });
      response.cookies.set("teach_allow_hosts", host, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24,
      });
      return response;
    }
  }

  if (request.nextUrl.searchParams.has("u") && !isProtectedPortalPath(request.nextUrl.pathname)) {
    const upstream = resolveMirroredUpstream(request);
    if (upstream) {
      const rewrite = request.nextUrl.clone();
      rewrite.pathname = "/api/browse";
      rewrite.search = `?u=${encodeURIComponent(upstream.toString())}`;
      return NextResponse.rewrite(rewrite, { request: { headers } });
    }
  }

  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!_next|favicon.ico).*)"] };
