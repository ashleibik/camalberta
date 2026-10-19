/**
 * Geographic areas we cover. Calgary and the Bow Valley come from the project
 * brief; Edmonton and the QEII corridor were added later at the owner's
 * request. These are the single source of truth for which cameras we keep
 * from the province-wide 511 feed.
 *
 * - Calgary, the Bow Valley and Edmonton are bounding boxes (below).
 * - The QEII (Highway 2, Calgary to Edmonton) is a corridor along the Trip
 *   Check route line, not a box: a box that size would also sweep in Red
 *   Deer's city streets and Highway 11 to Sylvan Lake. See
 *   src/lib/trip/corridors.ts.
 */

export const AREAS = ["calgary", "bow_valley", "qe2", "edmonton"] as const
export type Area = (typeof AREAS)[number]

/** Areas defined by a bounding box, checked in this order. */
export const BOX_AREAS = ["calgary", "bow_valley", "edmonton"] as const
export type BoxArea = (typeof BOX_AREAS)[number]

interface BoundingBox {
  readonly minLat: number
  readonly maxLat: number
  readonly minLng: number
  readonly maxLng: number
}

export const AREA_BOUNDS: Record<BoxArea, BoundingBox> = {
  calgary: { minLat: 50.84, maxLat: 51.22, minLng: -114.32, maxLng: -113.85 },
  // The brief's box started at -115.25 (just east of Canmore). It now reaches
  // east to Calgary's edge so Highway 1 cameras between the city and the
  // mountains (Hwy 22, Dead Man's Flats) are kept for Trip Check.
  bow_valley: { minLat: 50.95, maxLat: 51.45, minLng: -116.3, maxLng: -114.32 },
  // City limits plus a margin for the ring roads (Anthony Henday).
  edmonton: { minLat: 53.35, maxLat: 53.75, minLng: -113.8, maxLng: -113.2 },
}

function inBox(lat: number, lng: number, box: BoundingBox): boolean {
  return (
    lat >= box.minLat &&
    lat <= box.maxLat &&
    lng >= box.minLng &&
    lng <= box.maxLng
  )
}

/**
 * Which box area a coordinate falls in, or null if it is outside every box.
 * Calgary is checked first, so the shared Calgary / Bow Valley edge counts as
 * Calgary.
 */
export function classifyArea(lat: number, lng: number): BoxArea | null {
  for (const area of BOX_AREAS) {
    if (inBox(lat, lng, AREA_BOUNDS[area])) return area
  }
  return null
}
