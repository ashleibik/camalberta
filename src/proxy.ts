import { NextResponse, type NextRequest } from "next/server"

import { ADMIN_AUTH_CHALLENGE, isAdminAuthorized } from "@/lib/auth"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"

const ADMIN_PATH = /^\/admin(\/|$)/

/**
 * - Bad input gets a 400, even in the URL path itself: an API path that isn't
 *   valid percent-encoding (e.g. `/api/cameras/%E0%A4%A`) is rejected here,
 *   before routing. Without this, Next.js fails while decoding the route
 *   params and answers with a bare 500.
 * - /admin pages need the admin login (HTTP Basic, CRON_SECRET as password).
 *   Each admin page, route and action checks again (defense in depth).
 */
export function proxy(request: NextRequest) {
  for (const segment of request.nextUrl.pathname.split("/")) {
    try {
      decodeURIComponent(segment)
    } catch {
      return NextResponse.json(
        { error: "Invalid request path" },
        { status: 400 }
      )
    }
  }

  if (ADMIN_PATH.test(request.nextUrl.pathname)) {
    const limited = enforceRateLimit(request, "admin", RATE_LIMITS.admin)
    if (limited) return limited
    if (!isAdminAuthorized(request.headers.get("authorization"))) {
      return new NextResponse("Sign-in required.", {
        status: 401,
        headers: {
          "WWW-Authenticate": ADMIN_AUTH_CHALLENGE,
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      })
    }
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/api/:path*", "/admin", "/admin/:path*"],
}
