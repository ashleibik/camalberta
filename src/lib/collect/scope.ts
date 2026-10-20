import "server-only"

import { and, eq, inArray } from "drizzle-orm"

import { getDb, type Database } from "@/lib/db"
import { cameras, type CameraSource } from "@/lib/db/schema"

import type { Point } from "./nearest"

/**
 * Which cameras the road condition collector covers, shared by the collector
 * and the sync (which keeps the 511 data near these cameras).
 *
 * Bow Valley cameras that show roads. Sunshine Village's webcams show ski
 * runs, which would only add noise to a road-surface model.
 */
export const COLLECT_AREA = "bow_valley"
export const COLLECT_SOURCES: readonly CameraSource[] = ["alberta511", "banff"]

/** The nearest weather station must be within this distance to count. */
export const STATION_MAX_DISTANCE_M = 30_000

export async function collectorCameraPoints(
  db: Database = getDb()
): Promise<Point[]> {
  return db
    .select({ lat: cameras.lat, lng: cameras.lng })
    .from(cameras)
    .where(
      and(
        eq(cameras.area, COLLECT_AREA),
        inArray(cameras.source, [...COLLECT_SOURCES])
      )
    )
}
