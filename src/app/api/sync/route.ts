import { revalidateTag } from "next/cache"

import { isAuthorized } from "@/lib/auth"
import { noQuery, parseQuery } from "@/lib/http"
import { CAMERAS_CACHE_TAG } from "@/lib/queries"
import { TRIP_REPORT_TAG } from "@/lib/trip/store"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { runSync } from "@/lib/sync"

// Route handlers are uncached by default, and this one reads the request, so
// it runs per request. cacheComponents already forces the Node.js runtime.
// Allow time for the full sync (every camera source, three Trip Check feeds,
// upserts and push alerts; about 5 seconds in practice).
export const maxDuration = 60

async function handle(request: Request): Promise<Response> {
  // Limit before the secret check too, so the secret can't be brute-forced
  // at speed (it's 32+ random chars, but defense in depth).
  const limited = enforceRateLimit(request, "sync", RATE_LIMITS.api)
  if (limited) return limited

  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  // Takes no input: no query parameters, and the body is never read.
  const query = parseQuery(request, noQuery)
  if (!query.ok) return query.response

  try {
    const result = await runSync()
    // Refresh the cached /api/cameras payload immediately with the new data.
    revalidateTag(CAMERAS_CACHE_TAG, { expire: 0 })
    revalidateTag(TRIP_REPORT_TAG, { expire: 0 })
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    // Never leak internals to the client.
    return Response.json({ error: "Sync failed" }, { status: 500 })
  }
}

// Vercel Cron triggers GET; POST is for manual runs. Both require the secret.
export const GET = handle
export const POST = handle
