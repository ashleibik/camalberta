import "server-only"

import { CONDITION_MAX_DISTANCE_M } from "@/lib/collect/labels"
import { segmentsNearPoints, stationsNearPoints } from "@/lib/collect/nearest"
import {
  collectorCameraPoints,
  STATION_MAX_DISTANCE_M,
} from "@/lib/collect/scope"
import { env } from "@/lib/env"
import {
  fetchConditions,
  fetchEvents,
  fetchStations,
  type RoadCondition,
  type RoadEvent,
} from "@/lib/sources/alberta511-trip"
import { describeSyncError } from "@/lib/sources/feed"

import {
  conditionsNearRoutes,
  eventsNearRoutes,
  stationsNearRoutes,
  unrecognizedValues,
} from "./filter"
import {
  markSynced,
  replaceConditions,
  replaceEvents,
  replaceStations,
  SYNC_KEYS,
} from "./store"

export interface TripSyncResult {
  status: "ok" | "partial" | "failed" | "skipped"
  /** Rows stored per dataset (only for datasets that synced). */
  conditions?: number
  events?: number
  stations?: number
  /** Safe, generic reasons (never upstream text or URLs). */
  errors?: string[]
  reason?: string
}

function logLine(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error)
}

/**
 * Pull 511 road conditions, events and weather stations, keep what lies along
 * our routes, and replace the stored copy. Each dataset is replaced only when
 * its own fetch succeeds, so one failing feed never wipes the others (and its
 * last good copy ages into "Data may be out of date").
 *
 * Callers must hold the 511 call window (claimAlberta511Window).
 */
export async function syncTripData(): Promise<TripSyncResult> {
  if (!env.ALBERTA_511_API_KEY) {
    return { status: "skipped", reason: "511 Alberta is not configured" }
  }

  const [conditions, events, stations] = await Promise.allSettled([
    fetchConditions(),
    fetchEvents(),
    fetchStations(),
  ])

  // Also keep what's near the road condition collector's cameras (Phase 9):
  // Hwy 93S, 1A, 40 and Banff streets aren't on a trip route.
  const collectorPoints = await collectorCameraPoints()
  const union = <T extends { id: number }>(a: T[], b: T[]) => [
    ...new Map([...a, ...b].map((item) => [item.id, item])).values(),
  ]

  const result: TripSyncResult = { status: "ok" }
  const errors: string[] = []
  const now = new Date()
  let keptConditions: RoadCondition[] | null = null
  let keptEvents: RoadEvent[] | null = null

  if (conditions.status === "fulfilled") {
    keptConditions = union(
      conditionsNearRoutes(conditions.value),
      segmentsNearPoints(
        conditions.value,
        collectorPoints,
        CONDITION_MAX_DISTANCE_M
      )
    )
    await replaceConditions(keptConditions)
    await markSynced(SYNC_KEYS.conditions, now)
    result.conditions = keptConditions.length
  } else {
    console.error(
      `[trip] road conditions failed: ${logLine(conditions.reason)}`
    )
    errors.push(`road conditions: ${describeSyncError(conditions.reason)}`)
  }

  if (events.status === "fulfilled") {
    keptEvents = eventsNearRoutes(events.value)
    await replaceEvents(keptEvents)
    await markSynced(SYNC_KEYS.events, now)
    result.events = keptEvents.length
  } else {
    console.error(`[trip] events failed: ${logLine(events.reason)}`)
    errors.push(`events: ${describeSyncError(events.reason)}`)
  }

  if (stations.status === "fulfilled") {
    const kept = union(
      stationsNearRoutes(stations.value),
      stationsNearPoints(
        stations.value,
        collectorPoints,
        STATION_MAX_DISTANCE_M
      )
    )
    await replaceStations(kept)
    await markSynced(SYNC_KEYS.stations, now)
    result.stations = kept.length
  } else {
    console.error(`[trip] weather stations failed: ${logLine(stations.reason)}`)
    errors.push(`weather stations: ${describeSyncError(stations.reason)}`)
  }

  const unknown = unrecognizedValues(keptConditions ?? [], keptEvents ?? [])
  if (unknown.length > 0) {
    console.warn(
      `[trip] 511 values with no rule in src/lib/trip/config.ts (counted as yellow): ${unknown.join(", ")}`
    )
  }

  if (errors.length > 0) {
    result.errors = errors
    result.status = errors.length === 3 ? "failed" : "partial"
  }
  return result
}
