import { noQuery, parseQuery } from "@/lib/http"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { getTripReport } from "@/lib/trip/store"
import { tripIdSchema } from "@/lib/trip/trips"

export const maxDuration = 15

/**
 * Trip Check: verdict, reasons, cameras in driving order, road conditions
 * with weather, and events for one trip. Served from our database only; the
 * sync job is the only thing that calls 511.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/trips/[trip]">
) {
  const limited = enforceRateLimit(request, "trip", RATE_LIMITS.api)
  if (limited) return limited

  const { trip } = await ctx.params
  const parsed = tripIdSchema.safeParse(trip)
  if (!parsed.success) {
    return Response.json({ error: "Unknown trip" }, { status: 400 })
  }
  const query = parseQuery(request, noQuery)
  if (!query.ok) return query.response

  try {
    const report = await getTripReport(parsed.data)
    return Response.json(report, {
      headers: {
        // The data changes once per sync (every 15 minutes); a minute of
        // shared caching is plenty and keeps the stale check honest.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
      },
    })
  } catch {
    return Response.json({ error: "Trip check failed" }, { status: 500 })
  }
}
