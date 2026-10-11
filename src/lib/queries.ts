import "server-only"

import { asc, sql } from "drizzle-orm"
import { cacheLife, cacheTag } from "next/cache"
import { z } from "zod"

import type {
  CamerasGeoJSON,
  HealthResponse,
  SourceHealth,
} from "@/lib/api-types"
import { getDb } from "@/lib/db"
import { cameras, type CameraSource } from "@/lib/db/schema"
import { toFeature } from "@/lib/serialize"

/** Revalidated from the sync route so fresh cameras show up immediately. */
export const CAMERAS_CACHE_TAG = "cameras"

/**
 * All cameras as compact GeoJSON. Cached for 5 minutes (the brief's target);
 * a sync calls `revalidateTag(CAMERAS_CACHE_TAG)` to refresh it on demand.
 */
export async function getCamerasGeoJSON(): Promise<CamerasGeoJSON> {
  "use cache"
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 })
  cacheTag(CAMERAS_CACHE_TAG)

  const rows = await getDb().select().from(cameras).orderBy(asc(cameras.id))
  return { type: "FeatureCollection", features: rows.map(toFeature) }
}

const healthRowSchema = z.object({
  source: z.string(),
  total: z.coerce.number().int(),
  live: z.coerce.number().int(),
  stale: z.coerce.number().int(),
  offline: z.coerce.number().int(),
  last_seen_at: z.union([z.string(), z.date(), z.null()]),
})

function toIso(value: string | Date | null): string | null {
  if (value === null) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** Counts per source/status and the last sync time (max lastSeenAt). */
export async function getHealth(): Promise<HealthResponse> {
  const result = (await getDb().execute(sql`
    select
      source,
      count(*)::int as total,
      count(*) filter (where status = 'live')::int as live,
      count(*) filter (where status = 'stale')::int as stale,
      count(*) filter (where status = 'offline')::int as offline,
      max(last_seen_at) as last_seen_at
    from cameras
    group by source
    order by source
  `)) as { rows: unknown[] }

  const rows = healthRowSchema.array().parse(result.rows)

  const sources: SourceHealth[] = rows.map((row) => ({
    source: row.source as CameraSource,
    total: row.total,
    live: row.live,
    stale: row.stale,
    offline: row.offline,
    lastSeenAt: toIso(row.last_seen_at),
  }))

  const totals = sources.reduce(
    (acc, s) => ({
      total: acc.total + s.total,
      live: acc.live + s.live,
      stale: acc.stale + s.stale,
      offline: acc.offline + s.offline,
    }),
    { total: 0, live: 0, stale: 0, offline: 0 }
  )

  const lastSyncAt =
    sources
      .map((s) => s.lastSeenAt)
      .filter((v): v is string => v !== null)
      .sort()
      .at(-1) ?? null

  return {
    status: "ok",
    totals,
    sources,
    lastSyncAt,
    now: new Date().toISOString(),
  }
}
