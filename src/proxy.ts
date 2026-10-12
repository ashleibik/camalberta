import { NextResponse, type NextRequest } from "next/server"

/**
 * Bad input gets a 400, even in the URL path itself: an API path that isn't
 * valid percent-encoding (e.g. `/api/cameras/%E0%A4%A`) is rejected here,
 * before routing. Without this, Next.js fails while decoding the route params
 * and answers with a bare 500.
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
  return NextResponse.next()
}

export const config = {
  matcher: "/api/:path*",
}
