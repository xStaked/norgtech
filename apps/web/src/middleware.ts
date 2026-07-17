import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, getUserRoleFromToken } from "@/lib/auth";
import { matchesPrefix, protectedPaths, resolveRoleRedirect } from "@/lib/route-guards";

export { resolveRoleRedirect } from "@/lib/route-guards";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtectedPath = protectedPaths.some((protectedPath) => matchesPrefix(pathname, protectedPath));

  if (!isProtectedPath) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const role = getUserRoleFromToken(token);
  const redirectPath = resolveRoleRedirect(pathname, role);

  if (redirectPath) {
    return NextResponse.redirect(new URL(redirectPath, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/customers/:path*",
    "/opportunities/:path*",
    "/quotes/:path*",
    "/orders/:path*",
    "/billing-requests/:path*",
    "/products/:path*",
    "/segments/:path*",
    "/visits/:path*",
    "/expenses/:path*",
    "/follow-ups/:path*",
    "/agenda/:path*",
    "/nora",
    "/nora/:path*",
    "/companies/:path*",
    "/zones/:path*",
    "/invoices/:path*",
  ],
};
