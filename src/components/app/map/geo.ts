import type { ClientCamera } from "@/lib/client/types"
import { isVideoSource } from "@/lib/media"
import type { Area } from "@/lib/sources/areas"

// Match the status tokens in globals.css.
export const STATUS_COLORS = {
  live: "#22c55e",
  stale: "#f59e0b",
  offline: "#ef4444",
  unknown: "#a1a1aa",
} as const

export const CALGARY_CENTER: [number, number] = [-114.0719, 51.0447]
export const BANFF_CENTER: [number, number] = [-115.5708, 51.1784]
export const EDMONTON_CENTER: [number, number] = [-113.4938, 53.5461]

/**
 * Where the map flies for each area (the Banff view also shows Sunshine; the
 * QEII view shows the whole Calgary to Edmonton corridor).
 */
export const AREA_VIEWS: Record<
  Area,
  { label: string; center: [number, number]; zoom: number }
> = {
  calgary: { label: "Calgary", center: CALGARY_CENTER, zoom: 10 },
  bow_valley: { label: "Banff", center: [-115.64, 51.14], zoom: 10.2 },
  qe2: { label: "QEII", center: [-113.75, 52.3], zoom: 6.6 },
  edmonton: { label: "Edmonton", center: EDMONTON_CENTER, zoom: 10.2 },
}

const STYLE_BASE = "https://tiles.openfreemap.org/styles"

export function styleUrl(theme: string | undefined): string {
  return theme === "light" ? `${STYLE_BASE}/positron` : `${STYLE_BASE}/dark`
}

export interface CameraFeatureCollection {
  type: "FeatureCollection"
  features: Array<{
    type: "Feature"
    geometry: { type: "Point"; coordinates: [number, number] }
    properties: { id: string; name: string; status: string; video: boolean }
  }>
}

export function camerasToGeoJSON(
  cameras: readonly ClientCamera[]
): CameraFeatureCollection {
  return {
    type: "FeatureCollection",
    features: cameras.map((c) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [c.lng, c.lat] },
      properties: {
        id: c.id,
        name: c.name,
        status: c.status,
        video: isVideoSource(c.source),
      },
    })),
  }
}
