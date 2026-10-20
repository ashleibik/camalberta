import { z } from "zod"

import { isAuthorized } from "@/lib/auth"
import { parseQuery } from "@/lib/http"
import { sendTestAlerts } from "@/lib/push/alerts"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { tripIdSchema } from "@/lib/trip/trip-schema"

export const maxDuration = 30

const querySchema = z.strictObject({ trip: z.optional(tripIdSchema) })

/**
 * Send a test notification to every subscriber (or one trip's, with
 * `?trip=banff`). Protected by CRON_SECRET, like /api/sync:
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     "http://localhost:3000/api/push/test?trip=banff"
 */
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "push-test", RATE_LIMITS.api)
  if (limited) return limited
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const query = parseQuery(request, querySchema)
  if (!query.ok) return query.response

  try {
    const result = await sendTestAlerts(query.data.trip)
    return Response.json(result, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return Response.json({ error: "Test alert failed" }, { status: 500 })
  }
}
