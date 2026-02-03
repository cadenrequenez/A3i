import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED_PATHS = ["/"];
const ADMIN_PATHS = ["/admin"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!PROTECTED_PATHS.some((path) => pathname.startsWith(path)) || pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  const token = request.cookies.get("a3i_token")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    const secret = new TextEncoder().encode(process.env.NEXT_JWT_SECRET || "change-me");
    const { payload } = await jwtVerify(token, secret);
    const role = payload.role as string | undefined;

    if (ADMIN_PATHS.some((path) => pathname.startsWith(path)) && role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"]
};
