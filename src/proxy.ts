import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect for signed-out visitors. This only checks that a session cookie
 * exists; real session validation and authorization happen on the server in every
 * page, server action and route handler.
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/students/:path*",
    "/teachers/:path*",
    "/academics/:path*",
    "/attendance/:path*",
    "/examinations/:path*",
    "/report-cards/:path*",
    "/fees/:path*",
    "/reports/:path*",
    "/users/:path*",
    "/audit-log/:path*",
    "/settings/:path*",
    "/account/:path*",
    "/my/:path*",
  ],
};
