import "server-only"

import { and, eq, notInArray, sql } from "drizzle-orm"

import { getDb } from "@/lib/db"
import { cameras, type CameraSource, type NewCamera } from "@/lib/db/schema"
import { env } from "@/lib/env"
import { sendTripAlerts, type AlertResult } from "@/lib/push/alerts"
import { adapters, type NormalizedCamera } from "@/lib/sources"
import { describeSyncError } from "@/lib/sources/feed"
import { claimAlberta511Window } from "@/lib/trip/store"
import { syncTripData, type TripSyncResult } from "@/lib/trip/sync"

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
  /** Trip Check: 511 road conditions, events and weather stations. */
  trip: TripSyncResult
  /** Trip Check push alerts sent after the trip data refreshed. */
  alerts: AlertResult
}

const THROTTLED =
  "skipped: 511 allows 10 calls a minute and another sync just ran; try again in a minute"

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

function logLine(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause =
    error.cause instanceof Error ? ` (cause: ${error.cause.message})` : ""
  return `${error.name}: ${error.message}${cause}`
}

export async function runSync(): Promise<SyncResult> {
  const start = Date.now()
  const startedAt = new Date(start).toISOString()
  const results: SourceResult[] = []
  let upserted = 0

  // One sync makes 4 calls to 511 (cameras plus three Trip Check feeds).
  // Claim the shared window first so repeated or overlapping syncs can't
  // exceed 511's limit of 10 calls per 60 seconds.
  const may511 = env.ALBERTA_511_API_KEY ? await claimAlberta511Window() : false

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
    if (adapter.source === "alberta511" && !may511) {
      results.push({
        source: adapter.source,
        status: "skipped",
        fetched: 0,
        markedOffline: 0,
        error: THROTTLED,
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
      // Server log only. Name and message, not the whole object: request
      // details could carry the 511 key, which travels in the query string.
      console.error(`[sync] ${adapter.source} failed: ${logLine(error)}`)
      results.push({
        source: adapter.source,
        status: "failed",
        fetched: 0,
        markedOffline: 0,
        error: describeSyncError(error),
      })
    }
  }

  let trip: TripSyncResult
  if (!env.ALBERTA_511_API_KEY) {
    trip = { status: "skipped", reason: "511 Alberta is not configured" }
  } else if (!may511) {
    trip = { status: "skipped", reason: THROTTLED }
  } else {
    try {
      trip = await syncTripData()
    } catch (error) {
      // A database error while storing; the feeds' own failures are caught
      // inside syncTripData.
      console.error(`[sync] trip data failed: ${logLine(error)}`)
      trip = { status: "failed", errors: [describeSyncError(error)] }
    }
  }

  // Alert only on fresh data: a failed or skipped trip sync sends nothing.
  let alerts: AlertResult = {
    status: "skipped",
    sent: 0,
    removed: 0,
    failed: 0,
  }
  if (trip.status === "ok" || trip.status === "partial") {
    try {
      alerts = await sendTripAlerts()
    } catch (error) {
      console.error(`[sync] push alerts failed: ${logLine(error)}`)
    }
  }

  const finished = Date.now()
  return {
    startedAt,
    finishedAt: new Date(finished).toISOString(),
    durationMs: finished - start,
    upserted,
    sources: results,
    trip,
    alerts,
  }
}
