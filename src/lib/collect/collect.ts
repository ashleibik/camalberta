import "server-only"

import { createHash } from "node:crypto"

import { and, asc, desc, eq, inArray, ne } from "drizzle-orm"

import { getDb, type Database } from "@/lib/db"
import {
  cameras,
  COLLECT_RUN_KEY,
  roadConditions,
  snapshots,
  syncState,
  weatherStations,
  type NewSnapshot,
} from "@/lib/db/schema"
import { meanBrightness, toJpeg } from "@/lib/images/resize"
import { fetchCameraImage } from "@/lib/proxy/image"
import type { FetchLike } from "@/lib/proxy/upstream"
import {
  getSnapshotStorage,
  snapshotKey,
  type SnapshotStorage,
} from "@/lib/storage/snapshots"

import { autoLabel, CONDITION_MAX_DISTANCE_M } from "./labels"
import { nearestSegment, nearestStation, prepareSegments } from "./nearest"
import { COLLECT_AREA, COLLECT_SOURCES, STATION_MAX_DISTANCE_M } from "./scope"

/**
 * Road condition data collection (Phase 9). Every 15 minutes: one snapshot
 * per Bow Valley road camera, resized to 512px wide, with the official 511
 * condition for that road and the nearest weather station reading copied
 * alongside. Uses only 511 data already in the database (the sync's), so it
 * makes no 511 calls of its own.
 *
 * Runs as a standalone script on a GitHub Actions schedule in production
 * (scripts/collect.ts) and through POST /api/collect in development.
 */

export const SNAPSHOT_WIDTH = 512
const SNAPSHOT_QUALITY = 80
/** A photo older than this is from a frozen feed: its label would be wrong. */
export const MAX_PHOTO_AGE_MS = 30 * 60_000
const CONCURRENCY = 6

export interface CollectResult {
  startedAt: string
  durationMs: number
  storage: "local" | "s3"
  cameras: number
  saved: number
  /** Same photo as the camera's last snapshot (hash match): frozen feed. */
  unchanged: number
  /** Photo older than MAX_PHOTO_AGE_MS: frozen feed, not saved. */
  stale: number
  failed: number
  /** Bytes written to storage this run. */
  bytes: number
}

export interface CollectDeps {
  db?: Database
  storage?: SnapshotStorage
  fetchImpl?: FetchLike
  now?: () => Date
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

async function inBatches<T>(
  items: readonly T[],
  run: (item: T) => Promise<void>
): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) await run(items[next++]!)
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker)
  )
}

export async function runCollection(
  deps: CollectDeps = {}
): Promise<CollectResult> {
  const db = deps.db ?? getDb()
  const storage = deps.storage ?? getSnapshotStorage()
  const fetchImpl = deps.fetchImpl ?? fetch
  const now = deps.now ?? (() => new Date())
  const started = now()

  const [cameraRows, conditionRows, stationRows, lastRows] = await Promise.all([
    db
      .select({
        id: cameras.id,
        source: cameras.source,
        imageUrl: cameras.imageUrl,
        lat: cameras.lat,
        lng: cameras.lng,
      })
      .from(cameras)
      .where(
        and(
          eq(cameras.area, COLLECT_AREA),
          inArray(cameras.source, [...COLLECT_SOURCES]),
          ne(cameras.status, "offline")
        )
      )
      .orderBy(asc(cameras.id)),
    db.select().from(roadConditions),
    db.select().from(weatherStations),
    // Each camera's most recent snapshot hash.
    db
      .selectDistinctOn([snapshots.cameraId], {
        cameraId: snapshots.cameraId,
        contentHash: snapshots.contentHash,
      })
      .from(snapshots)
      .orderBy(snapshots.cameraId, desc(snapshots.takenAt)),
  ])

  const lastHash = new Map(lastRows.map((r) => [r.cameraId, r.contentHash]))
  const segments = prepareSegments(conditionRows, CONDITION_MAX_DISTANCE_M)

  const result: CollectResult = {
    startedAt: started.toISOString(),
    durationMs: 0,
    storage: storage.kind,
    cameras: cameraRows.length,
    saved: 0,
    unchanged: 0,
    stale: 0,
    failed: 0,
    bytes: 0,
  }

  await inBatches(cameraRows, async (camera) => {
    try {
      const image = await fetchCameraImage(camera, fetchImpl)
      if (!image.ok) {
        result.failed++
        return
      }
      const takenAt = now()
      if (
        image.lastModified !== null &&
        takenAt.getTime() - image.lastModified > MAX_PHOTO_AGE_MS
      ) {
        result.stale++
        return
      }
      const hash = sha256(image.bytes)
      if (lastHash.get(camera.id) === hash) {
        result.unchanged++
        return
      }

      const resized = await toJpeg(
        image.bytes,
        SNAPSHOT_WIDTH,
        SNAPSHOT_QUALITY
      )
      const brightness = await meanBrightness(resized.data)
      const condition = nearestSegment(camera, segments)
      const station = nearestStation(
        camera,
        stationRows,
        STATION_MAX_DISTANCE_M
      )
      const label = autoLabel({
        brightness,
        condition: condition
          ? {
              primary: condition.item.primaryCondition,
              secondary: condition.item.secondaryConditions,
              visibility: condition.item.visibility,
            }
          : null,
      })

      const key = snapshotKey(camera.id, takenAt, hash)
      await storage.put(key, resized.data, "image/jpeg")

      const row: NewSnapshot = {
        cameraId: camera.id,
        takenAt,
        photoAt:
          image.lastModified !== null ? new Date(image.lastModified) : null,
        imageKey: key,
        contentHash: hash,
        width: resized.width,
        height: resized.height,
        bytes: resized.data.byteLength,
        brightness,
        conditionId: condition?.item.id ?? null,
        conditionRoadway: condition?.item.roadway ?? null,
        conditionPrimary: condition?.item.primaryCondition ?? null,
        conditionSecondary: condition?.item.secondaryConditions ?? null,
        conditionVisibility: condition?.item.visibility ?? null,
        conditionUpdatedAt: condition?.item.updatedAt ?? null,
        conditionDistanceM: condition?.distanceM ?? null,
        stationId: station?.item.id ?? null,
        stationDistanceM: station?.distanceM ?? null,
        airTempC: station?.item.airTempC ?? null,
        pavementTempC: station?.item.pavementTempC ?? null,
        windKmh: station?.item.windKmh ?? null,
        humidityPct: station?.item.humidityPct ?? null,
        stationObservedAt: station?.item.observedAt ?? null,
        autoLabel: label.label,
        autoLabelReason: label.reason,
      }
      await db.insert(snapshots).values(row)
      result.saved++
      result.bytes += resized.data.byteLength
    } catch (error) {
      // Name and camera only: never URLs (511's carry no key, but keep the
      // habit) or storage endpoints.
      const name = error instanceof Error ? error.name : "Error"
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[collect] ${camera.id} failed: ${name}: ${message}`)
      result.failed++
    }
  })

  result.durationMs = now().getTime() - started.getTime()
  // For /api/health: proof the schedule is running, even when every photo
  // was unchanged and no snapshot row was written.
  await db
    .insert(syncState)
    .values({ key: COLLECT_RUN_KEY, at: started })
    .onConflictDoUpdate({ target: syncState.key, set: { at: started } })
  return result
}
