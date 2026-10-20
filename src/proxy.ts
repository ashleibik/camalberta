import { NextResponse, type NextRequest } from "next/server"

import {
  ADMIN_RESPONSE_HEADERS,
  checkAdminLogin,
  getLockoutStore,
} from "@/lib/admin/gate"
import { isAdminAuthorized, isAdminEnabled } from "@/lib/auth"
import {
  clientIpFromHeaders,
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/rate-limit"

const ADMIN_PATH = /^\/admin(\/|$)/

/**
 * - Bad input gets a 400, even in the URL path itself: an API path that isn't
 *   valid percent-encoding (e.g. `/api/cameras/%E0%A4%A`) is rejected here,
 *   before routing. Without this, Next.js fails while decoding the route
 *   params and answers with a bare 500.
 * - /admin: a plain 404 unless the admin pages are enabled (ADMIN_ENABLED in
 *   production), then rate limited, then the admin login with lockout
 *   (src/lib/admin/gate.ts). Each admin page, route and action checks the
 *   login again (defense in depth).
 */
export async function proxy(request: NextRequest) {
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
    if (!isAdminEnabled()) {
      // Exactly the site's normal 404, as for any path that doesn't exist
      // (no extra headers that would show /admin is there).
      return NextResponse.rewrite(new URL("/_not-found", request.url))
    }
    const limited = enforceRateLimit(request, "admin", RATE_LIMITS.admin)
    if (limited) return limited
    const denied = await checkAdminLogin(request.headers.get("authorization"), {
      authorize: isAdminAuthorized,
      store: getLockoutStore,
      ip: clientIpFromHeaders(request.headers),
      now: new Date(),
      log: (message) => console.warn(message),
    })
    if (denied) return denied
    const response = NextResponse.next()
    for (const [name, value] of Object.entries(ADMIN_RESPONSE_HEADERS)) {
      response.headers.set(name, value)
    }
    return response
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/api/:path*", "/admin", "/admin/:path*"],
}
