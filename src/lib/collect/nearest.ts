import {
  boundsIntersect,
  boundsOf,
  haversineM,
  locateOnLine,
  prepareLine,
  type LngLat,
  type PreparedLine,
} from "@/lib/trip/geo"

/**
 * What's near a camera: the closest 511 road condition segment and weather
 * station. Pure, for the collector and for the sync (which keeps these rows).
 */

export interface Point {
  lat: number
  lng: number
}

export interface PreparedSegment<T> {
  item: T
  lines: PreparedLine[]
}

/** Index each segment's lines once per run (a segment can have several). */
export function prepareSegments<
  T extends { path: readonly (readonly LngLat[])[] },
>(segments: readonly T[], maxDistanceM: number): PreparedSegment<T>[] {
  return segments.map((item) => ({
    item,
    lines: item.path
      .filter((part) => part.length >= 2)
      .map((part) => prepareLine(part, maxDistanceM)),
  }))
}

export function nearestSegment<T>(
  point: Point,
  segments: readonly PreparedSegment<T>[]
): { item: T; distanceM: number } | null {
  let best: { item: T; distanceM: number } | null = null
  for (const segment of segments) {
    for (const line of segment.lines) {
      const at = locateOnLine(line, [point.lng, point.lat])
      if (at && (!best || at.offsetM < best.distanceM)) {
        best = { item: segment.item, distanceM: at.offsetM }
      }
    }
  }
  return best
}

export function nearestStation<T extends Point>(
  point: Point,
  stations: readonly T[],
  maxDistanceM: number
): { item: T; distanceM: number } | null {
  let best: { item: T; distanceM: number } | null = null
  for (const station of stations) {
    const distanceM = haversineM(
      [point.lng, point.lat],
      [station.lng, station.lat]
    )
    if (distanceM <= maxDistanceM && (!best || distanceM < best.distanceM)) {
      best = { item: station, distanceM }
    }
  }
  return best
}

/** Segments within `maxDistanceM` of at least one of the points. */
export function segmentsNearPoints<
  T extends { path: readonly (readonly LngLat[])[] },
>(segments: readonly T[], points: readonly Point[], maxDistanceM: number): T[] {
  if (points.length === 0) return []
  // Most of the province is far from every camera: skip those segments
  // before indexing anything.
  const area = boundsOf(points.map((p) => [p.lng, p.lat] as const))
  const marginLat = maxDistanceM / 111_000
  const marginLng = marginLat / Math.cos((area.maxLat * Math.PI) / 180)
  const reach = {
    minLng: area.minLng - marginLng,
    maxLng: area.maxLng + marginLng,
    minLat: area.minLat - marginLat,
    maxLat: area.maxLat + marginLat,
  }
  const candidates = segments.filter((s) =>
    boundsIntersect(boundsOf(s.path.flat()), reach)
  )
  return prepareSegments(candidates, maxDistanceM)
    .filter((segment) =>
      points.some((point) => nearestSegment(point, [segment]) !== null)
    )
    .map((segment) => segment.item)
}

export function stationsNearPoints<T extends Point>(
  stations: readonly T[],
  points: readonly Point[],
  maxDistanceM: number
): T[] {
  return stations.filter((station) =>
    points.some(
      (point) =>
        haversineM([point.lng, point.lat], [station.lng, station.lat]) <=
        maxDistanceM
    )
  )
}
