/**
 * Small, dependency-free geometry for Trip Check: decoding 511's encoded
 * polylines, simplifying them, and locating points along a route line.
 * Coordinates are [lng, lat] (GeoJSON order) throughout.
 */

export type LngLat = readonly [number, number]

const EARTH_RADIUS_M = 6_371_008.8
const RAD = Math.PI / 180
const M_PER_DEG_LAT = RAD * EARTH_RADIUS_M

/** Metres per degree of longitude at a latitude. */
function mPerDegLng(lat: number): number {
  return M_PER_DEG_LAT * Math.cos(lat * RAD)
}

export function haversineM(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * RAD
  const dLng = (b[0] - a[0]) * RAD
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Decode a Google encoded polyline (precision 5), the format 511 Alberta uses
 * for `EncodedPolyline`. Returns [lng, lat] pairs. Throws on malformed input
 * (a truncated chunk or coordinates outside the valid range).
 */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = []
  let index = 0
  let lat = 0
  let lng = 0

  const next = (): number => {
    let result = 0
    let shift = 0
    for (;;) {
      if (index >= encoded.length) throw new Error("truncated polyline")
      const byte = encoded.charCodeAt(index++) - 63
      if (byte < 0 || byte > 63) throw new Error("invalid polyline character")
      result |= (byte & 0x1f) << shift
      shift += 5
      if (byte < 0x20) break
      if (shift > 30) throw new Error("polyline value too long")
    }
    return result & 1 ? ~(result >> 1) : result >> 1
  }

  while (index < encoded.length) {
    lat += next()
    lng += next()
    const point: [number, number] = [lng / 1e5, lat / 1e5]
    if (Math.abs(point[1]) > 90 || Math.abs(point[0]) > 180) {
      throw new Error("polyline coordinate out of range")
    }
    points.push(point)
  }
  return points
}

/**
 * Douglas-Peucker simplification with a tolerance in metres. Iterative, so a
 * long input can't overflow the stack.
 */
export function simplifyPath(
  path: readonly LngLat[],
  toleranceM: number
): [number, number][] {
  if (path.length <= 2) return path.map((p) => [p[0], p[1]])
  const lat0 = path[0]![1]
  const kx = mPerDegLng(lat0)
  const xy = path.map((p) => [p[0] * kx, p[1] * M_PER_DEG_LAT] as const)
  const keep = new Uint8Array(path.length)
  keep[0] = 1
  keep[path.length - 1] = 1
  const stack: Array<[number, number]> = [[0, path.length - 1]]

  while (stack.length > 0) {
    const [first, last] = stack.pop()!
    const [ax, ay] = xy[first]!
    const [bx, by] = xy[last]!
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy)
    let maxDistance = 0
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const [px, py] = xy[i]!
      const distance =
        len === 0
          ? Math.hypot(px - ax, py - ay)
          : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len
      if (distance > maxDistance) {
        maxDistance = distance
        index = i
      }
    }
    if (index > 0 && maxDistance > toleranceM) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }

  const out: [number, number][] = []
  path.forEach((p, i) => {
    if (keep[i]) out.push([p[0], p[1]])
  })
  return out
}

// Grid cell size for the edge index, in degrees (~2.2 km north-south).
const CELL_DEG = 0.02

/**
 * A route line prepared for fast "how far from the line, and how far along
 * it" queries: cumulative distances per vertex plus a coarse grid index of
 * edges, so each query checks only nearby edges.
 */
export interface PreparedLine {
  readonly coords: readonly LngLat[]
  /** Distance along the line to each vertex, metres. */
  readonly cumulativeM: readonly number[]
  readonly lengthM: number
  /** Queries farther than this from the line are reported as off it. */
  readonly maxQueryM: number
  /** The line's bounds grown by `maxQueryM`: nothing outside can match. */
  readonly bounds: Bounds
  readonly cells: ReadonlyMap<string, readonly number[]>
}

export interface Bounds {
  minLng: number
  maxLng: number
  minLat: number
  maxLat: number
}

export function boundsOf(points: Iterable<LngLat>): Bounds {
  const b = {
    minLng: Infinity,
    maxLng: -Infinity,
    minLat: Infinity,
    maxLat: -Infinity,
  }
  for (const [lng, lat] of points) {
    b.minLng = Math.min(b.minLng, lng)
    b.maxLng = Math.max(b.maxLng, lng)
    b.minLat = Math.min(b.minLat, lat)
    b.maxLat = Math.max(b.maxLat, lat)
  }
  return b
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return (
    a.minLng <= b.maxLng &&
    a.maxLng >= b.minLng &&
    a.minLat <= b.maxLat &&
    a.maxLat >= b.minLat
  )
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`
}

/**
 * Prepare a line for `locateOnLine`. `maxQueryM` bounds the distances you can
 * ask about (the index only covers edges within that distance of a cell).
 */
export function prepareLine(
  coords: readonly LngLat[],
  maxQueryM: number
): PreparedLine {
  if (coords.length < 2) throw new Error("a line needs at least two points")
  const cumulativeM = [0]
  for (let i = 1; i < coords.length; i++) {
    cumulativeM.push(
      cumulativeM[i - 1]! + haversineM(coords[i - 1]!, coords[i]!)
    )
  }

  const cells = new Map<string, number[]>()
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]!
    const b = coords[i + 1]!
    const midLat = (a[1] + b[1]) / 2
    const marginLat = maxQueryM / M_PER_DEG_LAT
    const marginLng = maxQueryM / mPerDegLng(midLat)
    const x0 = Math.floor((Math.min(a[0], b[0]) - marginLng) / CELL_DEG)
    const x1 = Math.floor((Math.max(a[0], b[0]) + marginLng) / CELL_DEG)
    const y0 = Math.floor((Math.min(a[1], b[1]) - marginLat) / CELL_DEG)
    const y1 = Math.floor((Math.max(a[1], b[1]) + marginLat) / CELL_DEG)
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const key = cellKey(x, y)
        const list = cells.get(key)
        if (list) list.push(i)
        else cells.set(key, [i])
      }
    }
  }

  const raw = boundsOf(coords)
  const marginLat = maxQueryM / M_PER_DEG_LAT
  const marginLng =
    maxQueryM / mPerDegLng(Math.max(Math.abs(raw.minLat), Math.abs(raw.maxLat)))
  return {
    coords,
    cumulativeM,
    lengthM: cumulativeM.at(-1)!,
    maxQueryM,
    bounds: {
      minLng: raw.minLng - marginLng,
      maxLng: raw.maxLng + marginLng,
      minLat: raw.minLat - marginLat,
      maxLat: raw.maxLat + marginLat,
    },
    cells,
  }
}

export interface LinePosition {
  /** Shortest distance from the point to the line, metres. */
  offsetM: number
  /** Distance along the line to the closest point, metres. */
  alongM: number
}

/**
 * Where a point sits relative to a line, or null if it's farther than the
 * line's `maxQueryM`. Projects locally around the query point, so distances
 * stay accurate along a 300 km route.
 */
export function locateOnLine(
  line: PreparedLine,
  point: LngLat
): LinePosition | null {
  const { bounds } = line
  if (
    point[0] < bounds.minLng ||
    point[0] > bounds.maxLng ||
    point[1] < bounds.minLat ||
    point[1] > bounds.maxLat
  ) {
    return null
  }
  const edges = line.cells.get(
    cellKey(Math.floor(point[0] / CELL_DEG), Math.floor(point[1] / CELL_DEG))
  )
  if (!edges) return null

  const kx = mPerDegLng(point[1])
  const ky = M_PER_DEG_LAT
  const px = point[0] * kx
  const py = point[1] * ky
  let best: LinePosition | null = null

  for (const i of edges) {
    const a = line.coords[i]!
    const b = line.coords[i + 1]!
    const ax = a[0] * kx
    const ay = a[1] * ky
    const dx = b[0] * kx - ax
    const dy = b[1] * ky - ay
    const len2 = dx * dx + dy * dy
    const t =
      len2 === 0
        ? 0
        : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
    const offsetM = Math.hypot(ax + t * dx - px, ay + t * dy - py)
    if (!best || offsetM < best.offsetM) {
      const edgeM = line.cumulativeM[i + 1]! - line.cumulativeM[i]!
      best = { offsetM, alongM: line.cumulativeM[i]! + t * edgeM }
    }
  }

  return best && best.offsetM <= line.maxQueryM ? best : null
}

/**
 * Walk a path in steps of at most `stepM` metres, yielding each sample point
 * and the path length it stands for. Used to measure how much of a road
 * segment lies along a route.
 */
export function* samplePath(
  path: readonly LngLat[],
  stepM: number
): Generator<{ point: LngLat; weightM: number }> {
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!
    const b = path[i + 1]!
    const edgeM = haversineM(a, b)
    if (edgeM === 0) continue
    const steps = Math.max(1, Math.ceil(edgeM / stepM))
    for (let s = 0; s < steps; s++) {
      const t = (s + 0.5) / steps
      yield {
        point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        weightM: edgeM / steps,
      }
    }
  }
}
