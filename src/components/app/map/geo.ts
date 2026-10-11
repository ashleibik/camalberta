import type { ClientCamera } from "@/lib/client/types"

// Match the status tokens in globals.css.
export const STATUS_COLORS = {
  live: "#22c55e",
  stale: "#f59e0b",
  offline: "#ef4444",
  unknown: "#a1a1aa",
} as const

export const CALGARY_CENTER: [number, number] = [-114.0719, 51.0447]
export const BANFF_CENTER: [number, number] = [-115.5708, 51.1784]

const STYLE_BASE = "https://tiles.openfreemap.org/styles"

export function styleUrl(theme: string | undefined): string {
  return theme === "light" ? `${STYLE_BASE}/positron` : `${STYLE_BASE}/dark`
}

export interface CameraFeatureCollection {
  type: "FeatureCollection"
  features: Array<{
    type: "Feature"
    geometry: { type: "Point"; coordinates: [number, number] }
    properties: { id: string; name: string; status: string }
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
      properties: { id: c.id, name: c.name, status: c.status },
    })),
  }
}
