import { and, eq } from "drizzle-orm"

import { getDb } from "@/lib/db"
import { pushSubscriptions } from "@/lib/db/schema"
import { noQuery, parseJsonBody, parseQuery } from "@/lib/http"
import { unsubscribeBodySchema } from "@/lib/push/schema"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"

/**
 * Turn alerts off for one trip, or for every trip when `trip` is omitted.
 * Deletes the stored subscription rows outright. Works even when push is no
 * longer configured, so people can always clean up.
 */
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "push", RATE_LIMITS.push)
  if (limited) return limited
  const query = parseQuery(request, noQuery)
  if (!query.ok) return query.response

  const body = await parseJsonBody(request, unsubscribeBodySchema)
  if (!body.ok) return body.response
  const { endpoint, trip } = body.data

  try {
    const removed = await getDb()
      .delete(pushSubscriptions)
      .where(
        trip
          ? and(
              eq(pushSubscriptions.endpoint, endpoint),
              eq(pushSubscriptions.trip, trip)
            )
          : eq(pushSubscriptions.endpoint, endpoint)
      )
      .returning({ trip: pushSubscriptions.trip })
    return Response.json(
      { ok: true, removed: removed.length },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch {
    return Response.json(
      { error: "Could not turn off alerts" },
      { status: 500 }
    )
  }
}
