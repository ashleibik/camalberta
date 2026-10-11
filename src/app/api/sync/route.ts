import { revalidateTag } from "next/cache"

import { isAuthorized } from "@/lib/auth"
import { CAMERAS_CACHE_TAG } from "@/lib/queries"
import { runSync } from "@/lib/sync"

// Route handlers are uncached by default, and this one reads the request, so
// it runs per request. cacheComponents already forces the Node.js runtime.
// Allow time for the full sync (two upstream fetches plus upserts).
export const maxDuration = 60

async function handle(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await runSync()
    // Refresh the cached /api/cameras payload immediately with the new data.
    revalidateTag(CAMERAS_CACHE_TAG, { expire: 0 })
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
