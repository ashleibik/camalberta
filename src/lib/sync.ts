import "server-only"

import { and, eq, notInArray, sql } from "drizzle-orm"

import { getDb } from "@/lib/db"
import { cameras, type CameraSource, type NewCamera } from "@/lib/db/schema"
import { adapters, type NormalizedCamera } from "@/lib/sources"

export interface SourceResult {
  source: CameraSource
  status: "ok" | "failed" | "skipped"
  fetched: number
  markedOffline: number
  error?: string
}

export interface SyncResult {
  startedAt: string
  finishedAt: string
  durationMs: number
  upserted: number
  sources: SourceResult[]
}

function toRow(camera: NormalizedCamera): NewCamera {
  return {
    id: camera.id,
    source: camera.source,
    sourceId: camera.sourceId,
    name: camera.name,
    road: camera.road,
    direction: camera.direction,
    quadrant: camera.quadrant,
    area: camera.area,
    lat: camera.lat,
    lng: camera.lng,
    imageUrl: camera.imageUrl,
    status: "live",
  }
}

async function upsertCameras(rows: NewCamera[]): Promise<void> {
  if (rows.length === 0) return
  const db = getDb()
  // Chunked so a single statement never carries too many bind params.
  const chunkSize = 200
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    await db
      .insert(cameras)
      .values(chunk)
      .onConflictDoUpdate({
        target: cameras.id,
        set: {
          name: sql`excluded.name`,
          road: sql`excluded.road`,
          direction: sql`excluded.direction`,
          quadrant: sql`excluded.quadrant`,
          area: sql`excluded.area`,
          lat: sql`excluded.lat`,
          lng: sql`excluded.lng`,
          imageUrl: sql`excluded.image_url`,
          status: sql`excluded.status`,
          lastSeenAt: sql`now()`,
          updatedAt: sql`now()`,
        },
      })
  }
}

/**
 * Mark cameras of one source offline when they were not in this sync's fetch.
 * Only called for a source that returned at least one camera, so a transient
 * empty-but-200 upstream response never knocks a whole source offline.
 */
async function markMissingOffline(
  source: CameraSource,
  seenIds: string[]
): Promise<number> {
  const db = getDb()
  const result = await db
    .update(cameras)
    .set({ status: "offline", updatedAt: sql`now()` })
    .where(
      and(
        eq(cameras.source, source),
        notInArray(cameras.id, seenIds),
        notInArray(cameras.status, ["offline"])
      )
    )
    .returning({ id: cameras.id })
  return result.length
}

export async function runSync(): Promise<SyncResult> {
  const start = Date.now()
  const startedAt = new Date(start).toISOString()
  const results: SourceResult[] = []
  let upserted = 0

  for (const adapter of adapters) {
    if (adapter.isEnabled && !adapter.isEnabled()) {
      results.push({
        source: adapter.source,
        status: "skipped",
        fetched: 0,
        markedOffline: 0,
      })
      continue
    }

    try {
      const fetched = await adapter.fetch()
      await upsertCameras(fetched.map(toRow))
      upserted += fetched.length

      let markedOffline = 0
      if (fetched.length > 0) {
        markedOffline = await markMissingOffline(
          adapter.source,
          fetched.map((c) => c.id)
        )
      }

      results.push({
        source: adapter.source,
        status: "ok",
        fetched: fetched.length,
        markedOffline,
      })
    } catch (error) {
      results.push({
        source: adapter.source,
        status: "failed",
        fetched: 0,
        markedOffline: 0,
        error: error instanceof Error ? error.message : "unknown error",
      })
    }
  }

  const finished = Date.now()
  return {
    startedAt,
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - start,
    upserted,
    sources: results,
  }
}
