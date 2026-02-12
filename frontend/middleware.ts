import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PATHS = ["/"];
const PUBLIC_PATHS = ["/login", "/welcome"];
const ADMIN_PATHS = ["/admin"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isStaticAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/logos/") ||
    pathname === "/favicon.ico" ||
    /\.[a-zA-Z0-9]+$/.test(pathname);

  if (isStaticAsset) {
    return NextResponse.next();
  }

  if (!PROTECTED_PATHS.some((path) => pathname.startsWith(path)) || PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get("a3i_token")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/welcome", request.url));
  }

  const role = request.cookies.get("a3i_role")?.value;
  if (ADMIN_PATHS.some((path) => pathname.startsWith(path)) && role !== "admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"]
};
