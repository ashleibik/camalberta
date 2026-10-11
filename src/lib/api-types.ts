import type { CameraSource, CameraStatus } from "@/lib/db/schema"

/**
 * A camera as sent to the client. Deliberately omits `imageUrl`: the browser
 * only ever reaches an image through `/api/cam/[id]/image`.
 */
export interface PublicCamera {
  id: string
  source: CameraSource
  sourceId: string
  name: string
  road: string | null
  direction: string | null
  quadrant: string | null
  area: string
  lat: number
  lng: number
  status: CameraStatus
  lastSeenAt: string
  updatedAt: string
}

/** Compact per-marker properties for the map. */
export interface CameraFeatureProperties {
  id: string
  name: string
  source: CameraSource
  area: string
  status: CameraStatus
  quadrant: string | null
  direction: string | null
  road: string | null
}

export interface CameraFeature {
  type: "Feature"
  geometry: { type: "Point"; coordinates: [number, number] } // [lng, lat]
  properties: CameraFeatureProperties
}

export interface CamerasGeoJSON {
  type: "FeatureCollection"
  features: CameraFeature[]
}

export interface SourceHealth {
  source: CameraSource
  total: number
  live: number
  stale: number
  offline: number
  lastSeenAt: string | null
}

export interface HealthResponse {
  status: "ok"
  totals: { total: number; live: number; stale: number; offline: number }
  sources: SourceHealth[]
  lastSyncAt: string | null
  now: string
}
