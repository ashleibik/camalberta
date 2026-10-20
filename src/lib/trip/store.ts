import "server-only"

import { and, gte, inArray, lte, sql } from "drizzle-orm"
import { cacheLife, cacheTag } from "next/cache"

import { getDb } from "@/lib/db"
import {
  cameras,
  roadConditions,
  roadEvents,
  syncState,
  weatherStations,
} from "@/lib/db/schema"
import type {
  RoadCondition,
  RoadEvent,
  WeatherStation,
} from "@/lib/sources/alberta511-trip"

import type { TripReport } from "@/lib/api-types"

import { buildTripReport, type CameraInput, type TripData } from "./report"
import { ROUTES, type TripRoute } from "./routes"
import type { TripId } from "./trips"

/** Keys in the sync_state table. */
export const SYNC_KEYS = {
  /** Last time any instance started a round of 511 calls. */
  window: "511:window",
  conditions: "511:conditions",
  events: "511:events",
  stations: "511:stations",
} as const

/**
 * 511 allows 10 calls per 60 seconds. One sync makes 4 (cameras, road
 * conditions, events, weather stations), so we allow one sync's worth of
 * calls per window, shared by every instance through the database.
 */
export const ALBERTA511_WINDOW_SECONDS = 60

/**
 * Claim the 511 call window: true if no other sync used it in the last 60
 * seconds (and records that this one now has). One atomic upsert, so two
 * syncs racing on different instances can't both win.
 */
export async function claimAlberta511Window(): Promise<boolean> {
  const rows = await getDb()
    .insert(syncState)
    .values({ key: SYNC_KEYS.window, at: sql`now()` })
    .onConflictDoUpdate({
      target: syncState.key,
      set: { at: sql`now()` },
      setWhere: sql`${syncState.at} < now() - make_interval(secs => ${ALBERTA511_WINDOW_SECONDS})`,
    })
    .returning({ key: syncState.key })
  return rows.length > 0
}

export async function markSynced(key: string, at: Date): Promise<void> {
  await getDb()
    .insert(syncState)
    .values({ key, at })
    .onConflictDoUpdate({ target: syncState.key, set: { at } })
}

// Keeps every insert well under Postgres's bind parameter limit.
const CHUNK = 100

function chunks<T>(rows: readonly T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += CHUNK)
    out.push(rows.slice(i, i + CHUNK))
  return out
}

/** Replace all road condition rows with a fresh set, atomically. */
export async function replaceConditions(rows: readonly RoadCondition[]) {
  await getDb().transaction(async (tx) => {
    await tx.delete(roadConditions)
    for (const chunk of chunks(rows))
      await tx.insert(roadConditions).values(chunk)
  })
}

export async function replaceEvents(rows: readonly RoadEvent[]) {
  await getDb().transaction(async (tx) => {
    await tx.delete(roadEvents)
    for (const chunk of chunks(rows)) await tx.insert(roadEvents).values(chunk)
  })
}

export async function replaceStations(rows: readonly WeatherStation[]) {
  await getDb().transaction(async (tx) => {
    await tx.delete(weatherStations)
    for (const chunk of chunks(rows)) {
      await tx.insert(weatherStations).values(chunk)
    }
  })
}

/** Everything Trip Check needs from 511, as last synced. */
export async function loadTripData(): Promise<TripData> {
  const db = getDb()
  const [conditionRows, eventRows, stationRows, syncRows] = await Promise.all([
    db.select().from(roadConditions),
    db.select().from(roadEvents),
    db.select().from(weatherStations),
    db
      .select()
      .from(syncState)
      .where(inArray(syncState.key, [SYNC_KEYS.conditions, SYNC_KEYS.events])),
  ])

  const syncedAt = new Map(syncRows.map((row) => [row.key, row.at]))
  const conditionsAt = syncedAt.get(SYNC_KEYS.conditions)
  const eventsAt = syncedAt.get(SYNC_KEYS.events)
  // Only as fresh as the older of the two: a verdict built on current
  // conditions but hour-old events is an hour old.
  const dataUpdatedAt =
    conditionsAt && eventsAt
      ? new Date(Math.min(conditionsAt.getTime(), eventsAt.getTime()))
      : null

  return {
    conditions: conditionRows,
    events: eventRows,
    stations: stationRows,
    dataUpdatedAt,
  }
}

/**
 * Cameras inside a route's bounding box (grown by the largest match
 * distance). The precise 500 m match happens in matchCameras. Cameras that
 * upstream no longer lists (offline) are left out of the strip.
 */
export async function loadCamerasNear(
  route: TripRoute
): Promise<CameraInput[]> {
  const { bounds } = route.line
  return getDb()
    .select({
      id: cameras.id,
      name: cameras.name,
      source: cameras.source,
      status: cameras.status,
      lat: cameras.lat,
      lng: cameras.lng,
    })
    .from(cameras)
    .where(
      and(
        gte(cameras.lat, bounds.minLat),
        lte(cameras.lat, bounds.maxLat),
        gte(cameras.lng, bounds.minLng),
        lte(cameras.lng, bounds.maxLng),
        inArray(cameras.status, ["live", "stale"])
      )
    )
}

/** The full Trip Check report for one trip, from our database only. */
export async function getTripReport(
  trip: TripId,
  now: Date = new Date()
): Promise<TripReport> {
  const route = ROUTES[trip]
  const [data, nearby] = await Promise.all([
    loadTripData(),
    loadCamerasNear(route),
  ])
  return buildTripReport(trip, data, nearby, now)
}

/** Revalidated by the sync route, so a new verdict shows right away. */
export const TRIP_REPORT_TAG = "trip-report"

/**
 * The report, cached for up to a minute per trip and dropped on every sync.
 * Shared by the /trip page (server-rendered verdict) and /api/trips/[trip].
 * The stale check runs when the report is built, so "Data may be out of
 * date" can appear up to a minute late, never early.
 */
export async function getCachedTripReport(trip: TripId): Promise<TripReport> {
  "use cache"
  cacheLife({ stale: 30, revalidate: 60, expire: 300 })
  cacheTag(TRIP_REPORT_TAG)
  return getTripReport(trip)
}
