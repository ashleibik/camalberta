/**
 * Geographic areas we cover and the bounding boxes that classify a camera.
 * Boxes come from the project brief and are the single source of truth for
 * which cameras we keep from the province-wide 511 feed.
 */

export const AREAS = ["calgary", "bow_valley"] as const
export type Area = (typeof AREAS)[number]

interface BoundingBox {
  readonly minLat: number
  readonly maxLat: number
  readonly minLng: number
  readonly maxLng: number
}

export const AREA_BOUNDS: Record<Area, BoundingBox> = {
  calgary: { minLat: 50.84, maxLat: 51.22, minLng: -114.32, maxLng: -113.85 },
  bow_valley: { minLat: 50.95, maxLat: 51.45, minLng: -116.3, maxLng: -115.25 },
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
 * Which area a coordinate falls in, or null if it is outside everything we
 * cover. Calgary is checked first; the two boxes do not overlap.
 */
export function classifyArea(lat: number, lng: number): Area | null {
  for (const area of AREAS) {
    if (inBox(lat, lng, AREA_BOUNDS[area])) return area
  }
  return null
}
