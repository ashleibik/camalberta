import {
  MATCH_DISTANCE_M,
  SEGMENT_MIN_SHARE,
  WEATHER_MAX_GAP_KM,
} from "./config"
import {
  boundsIntersect,
  boundsOf,
  locateOnLine,
  samplePath,
  type LngLat,
} from "./geo"
import type { TripRoute } from "./routes"

/**
 * Which cameras, road condition segments, events and weather stations belong
 * to a route, and where along it they are. Distances come from config.ts.
 */

export interface Located {
  /** Distance from the start of the route (Calgary). */
  km: number
  /** Distance from the route line. */
  offsetM: number
}

// Road segments are measured by walking them in steps of this size.
const SAMPLE_STEP_M = 50

function locate(
  route: TripRoute,
  point: LngLat,
  maxOffsetM: number
): Located | null {
  const position = locateOnLine(route.line, point)
  if (!position || position.offsetM > maxOffsetM) return null
  return { km: position.alongM / 1000, offsetM: position.offsetM }
}

/** Cameras near the route, in driving order (by distance from Calgary). */
export function matchCameras<
  T extends { name: string; lat: number; lng: number },
>(route: TripRoute, cameras: readonly T[]): Array<T & Located> {
  const matched: Array<T & Located> = []
  for (const camera of cameras) {
    const at = locate(route, [camera.lng, camera.lat], MATCH_DISTANCE_M.camera)
    if (at) matched.push({ ...camera, ...at })
  }
  // Views of one physical camera share a position; keep them together and in
  // a stable order.
  return matched.sort((a, b) => a.km - b.km || a.name.localeCompare(b.name))
}

export interface SegmentSpan {
  fromKm: number
  toKm: number
  /**
   * Share of the segment's best-matching line that lies along the route
   * (0 to 1).
   */
  share: number
}

/**
 * How a road condition segment lines up with the route, or null if too little
 * of it lies along the route (a crossing road, or a parallel one like 2A).
 *
 * A segment can have several lines, usually one per carriageway. Where a
 * divided highway's carriageways split apart (Gateway Blvd and Calgary Trail
 * at Edmonton), the route follows only one, so the segment matches when any
 * one of its lines lies mostly along the route.
 */
export function matchSegment(
  route: TripRoute,
  path: readonly (readonly LngLat[])[]
): SegmentSpan | null {
  // Most of the province's segments are nowhere near: skip them cheaply.
  if (!boundsIntersect(boundsOf(path.flat()), route.line.bounds)) return null

  let share = 0
  let fromKm = Infinity
  let toKm = -Infinity

  for (const part of path) {
    let totalM = 0
    let onRouteM = 0
    const visit = (point: LngLat, weightM: number) => {
      totalM += weightM
      const at = locate(route, point, MATCH_DISTANCE_M.segment)
      if (!at) return
      onRouteM += weightM
      fromKm = Math.min(fromKm, at.km)
      toKm = Math.max(toKm, at.km)
    }
    if (part.length === 1) visit(part[0]!, 1)
    for (const sample of samplePath(part, SAMPLE_STEP_M)) {
      visit(sample.point, sample.weightM)
    }
    if (totalM > 0) share = Math.max(share, onRouteM / totalM)
  }

  return share >= SEGMENT_MIN_SHARE ? { fromKm, toKm, share } : null
}

/** Road condition segments along the route, in driving order. */
export function matchSegments<
  T extends { path: readonly (readonly LngLat[])[] },
>(route: TripRoute, segments: readonly T[]): Array<T & SegmentSpan> {
  const matched: Array<T & SegmentSpan> = []
  for (const segment of segments) {
    const span = matchSegment(route, segment.path)
    if (span) matched.push({ ...segment, ...span })
  }
  return matched.sort((a, b) => a.fromKm - b.fromKm || a.toKm - b.toKm)
}

/**
 * Events near the route, in driving order. An event can report a second
 * point (the far end of a work zone); whichever is closer counts.
 */
export function matchEvents<
  T extends {
    lat: number
    lng: number
    lat2: number | null
    lng2: number | null
  },
>(route: TripRoute, events: readonly T[]): Array<T & Located> {
  const matched: Array<T & Located> = []
  for (const event of events) {
    const candidates = [
      locate(route, [event.lng, event.lat], MATCH_DISTANCE_M.event),
      event.lat2 !== null && event.lng2 !== null
        ? locate(route, [event.lng2, event.lat2], MATCH_DISTANCE_M.event)
        : null,
    ].filter((c): c is Located => c !== null)
    const best = candidates.sort((a, b) => a.offsetM - b.offsetM)[0]
    if (best) matched.push({ ...event, ...best })
  }
  return matched.sort((a, b) => a.km - b.km)
}

/** Weather stations near the route, in driving order. */
export function matchStations<T extends { lat: number; lng: number }>(
  route: TripRoute,
  stations: readonly T[]
): Array<T & Located> {
  const matched: Array<T & Located> = []
  for (const station of stations) {
    const at = locate(
      route,
      [station.lng, station.lat],
      MATCH_DISTANCE_M.station
    )
    if (at) matched.push({ ...station, ...at })
  }
  return matched.sort((a, b) => a.km - b.km)
}

/**
 * The station to show for a stretch of road: one inside the stretch (nearest
 * its middle), otherwise the nearest one within WEATHER_MAX_GAP_KM of it, or
 * null when there's none close enough to be honest about.
 */
export function nearestStation<T extends { km: number }>(
  stations: readonly T[],
  fromKm: number,
  toKm: number
): T | null {
  const mid = (fromKm + toKm) / 2
  let best: { station: T; score: number } | null = null
  for (const station of stations) {
    const gap =
      station.km < fromKm
        ? fromKm - station.km
        : station.km > toKm
          ? station.km - toKm
          : 0
    if (gap > WEATHER_MAX_GAP_KM) continue
    // Inside the stretch beats outside; then closest to the middle.
    const score = gap * 1000 + Math.abs(station.km - mid)
    if (!best || score < best.score) best = { station, score }
  }
  return best?.station ?? null
}
