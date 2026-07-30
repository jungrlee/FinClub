import { NextResponse } from "next/server";

// admin.finclub.app is served by the SAME deployment/codebase as the main
// site — this rewrites requests on that hostname to app/admin/* internally
// while keeping the URL bar clean (no visible /admin prefix), and blocks
// the /admin/* paths from being reached directly on the main hostname.
const ADMIN_PREFIX = "/admin";

export function middleware(req) {
  const host = (req.headers.get("host") || "").split(":")[0];
  const isAdminHost = host.startsWith("admin.");
  const { pathname } = req.nextUrl;

  if (isAdminHost) {
    if (pathname.startsWith(ADMIN_PREFIX) || pathname.startsWith("/api") || pathname.startsWith("/_next")) {
      return NextResponse.next();
    }
    const url = req.nextUrl.clone();
    url.pathname = pathname === "/" ? ADMIN_PREFIX : ADMIN_PREFIX + pathname;
    return NextResponse.rewrite(url);
  }

  if (pathname.startsWith(ADMIN_PREFIX)) {
    return new NextResponse("Not found", { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
