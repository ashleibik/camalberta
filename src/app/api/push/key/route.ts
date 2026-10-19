import { noQuery, parseQuery } from "@/lib/http"
import { vapidPublicKey } from "@/lib/push/send"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"

/** The VAPID public key browsers need to subscribe to Trip Check alerts. */
export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "push-key", RATE_LIMITS.api)
  if (limited) return limited
  const query = parseQuery(request, noQuery)
  if (!query.ok) return query.response

  const publicKey = vapidPublicKey()
  if (!publicKey) {
    return Response.json(
      { error: "Alerts are not available" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    )
  }
  return Response.json(
    { publicKey },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  )
}
