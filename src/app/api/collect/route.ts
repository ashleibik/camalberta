import { isAuthorized } from "@/lib/auth"
import { runCollection } from "@/lib/collect/collect"
import { env } from "@/lib/env"
import { noQuery, parseQuery } from "@/lib/http"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { isSnapshotStorageConfigured } from "@/lib/storage/snapshots"

// ~37 cameras, 6 at a time: usually under 15 seconds.
export const maxDuration = 60

/**
 * Run one road condition collection (Phase 9). Protected by CRON_SECRET
 * (timing-safe), rate limited, strict query. Supabase pg_cron calls it every
 * 15 minutes (supabase/cron.sql); locally it's how to collect, since the dev
 * server owns the PGlite database. In production it needs the R2 bucket:
 * Vercel's disk is read-only, so without one it answers 503 instead of
 * failing every camera.
 */
async function handle(request: Request): Promise<Response> {
  const limited = enforceRateLimit(request, "collect", RATE_LIMITS.api)
  if (limited) return limited
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const query = parseQuery(request, noQuery)
  if (!query.ok) return query.response
  if (env.NODE_ENV === "production" && !isSnapshotStorageConfigured()) {
    return Response.json(
      { error: "Snapshot storage is not configured" },
      { status: 503 }
    )
  }

  try {
    const result = await runCollection()
    return Response.json(result, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return Response.json({ error: "Collection failed" }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
