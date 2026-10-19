import { count } from "drizzle-orm"

import { getDb } from "@/lib/db"
import { pushSubscriptions } from "@/lib/db/schema"
import { noQuery, parseJsonBody, parseQuery } from "@/lib/http"
import { subscribeBodySchema } from "@/lib/push/schema"
import { isPushConfigured } from "@/lib/push/send"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { computeTripVerdict } from "@/lib/trip/report"
import { loadTripData } from "@/lib/trip/store"

// A ceiling on stored subscriptions, so a flood of fake ones can't grow the
// table without bound (fake endpoints are also deleted on first delivery).
const MAX_SUBSCRIPTIONS = 20_000

/**
 * Turn on "Notify me if this trip gets worse" for one trip. Stores only the
 * push subscription (endpoint and keys) and the trip. The trip's current
 * verdict becomes the baseline, so the first alert means "worse than when you
 * subscribed".
 */
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "push", RATE_LIMITS.push)
  if (limited) return limited
  const query = parseQuery(request, noQuery)
  if (!query.ok) return query.response

  if (!isPushConfigured()) {
    return Response.json({ error: "Alerts are not available" }, { status: 503 })
  }
  const body = await parseJsonBody(request, subscribeBodySchema)
  if (!body.ok) return body.response
  const { trip, subscription } = body.data

  try {
    const db = getDb()
    const [total] = await db.select({ n: count() }).from(pushSubscriptions)
    if ((total?.n ?? 0) >= MAX_SUBSCRIPTIONS) {
      return Response.json(
        { error: "Alerts are full right now. Try again later." },
        { status: 503 }
      )
    }

    const verdict = computeTripVerdict(trip, await loadTripData(), new Date())
    const baseline = verdict.level === "unknown" ? null : verdict.level

    await db
      .insert(pushSubscriptions)
      .values({
        endpoint: subscription.endpoint,
        trip,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        baseline,
      })
      .onConflictDoUpdate({
        target: [pushSubscriptions.endpoint, pushSubscriptions.trip],
        set: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          baseline,
        },
      })

    return Response.json(
      { ok: true, trip },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    )
  } catch {
    return Response.json({ error: "Could not turn on alerts" }, { status: 500 })
  }
}
