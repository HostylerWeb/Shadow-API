import { NextResponse, type NextRequest } from "next/server";
import { isProtectedPortalPath, resolveMirroredUpstream } from "./src/browse/browse-mirror";

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);

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
