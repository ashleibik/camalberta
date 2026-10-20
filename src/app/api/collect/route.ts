import { isAuthorized } from "@/lib/auth"
import { runCollection } from "@/lib/collect/collect"
import { noQuery, parseQuery } from "@/lib/http"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"

// ~37 cameras, 6 at a time: usually under 15 seconds.
export const maxDuration = 60

/**
 * Run one road condition collection (Phase 9). Protected by CRON_SECRET.
 * In production the GitHub Actions schedule runs scripts/collect.ts instead
 * (image resizing off Vercel's CPU allowance); this route is for local
 * development, where the dev server owns the PGlite database, and for a
 * Vercel plan with frequent cron jobs.
 */
async function handle(request: Request): Promise<Response> {
  const limited = enforceRateLimit(request, "collect", RATE_LIMITS.api)
  if (limited) return limited
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const query = parseQuery(request, noQuery)
  if (!query.ok) return query.response

  try {
    const result = await runCollection()
    return Response.json(result, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return Response.json({ error: "Collection failed" }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
