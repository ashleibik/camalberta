import type { CameraSource, CameraStatus } from "@/lib/db/schema"
import type { TripId } from "@/lib/trip/trips"

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
  /** When the snapshot collector last ran (null: never). */
  lastCollectAt: string | null
  /** No sync for over 40 minutes: the 15-minute schedule has stopped. */
  syncLate: boolean
  now: string
}

// ---------------------------------------------------------------------------
// Trip Check (GET /api/trips/[trip])
// ---------------------------------------------------------------------------

export type TripLevel = "green" | "yellow" | "red"
/** A finding's level; "info" is shown but never changes the verdict. */
export type TripRuleLevel = TripLevel | "info"
/** "unknown": we can't say it looks good (old or missing data). */
export type TripVerdictLevel = TripLevel | "unknown"

export interface TripReason {
  level: Exclude<TripLevel, "green">
  text: string
  /** Where on the route, km from Calgary. */
  km: number
  kind: "condition" | "event"
}

export interface TripVerdict {
  level: TripVerdictLevel
  label: string
  reasons: TripReason[]
  /** Our road data is older than 30 minutes. */
  stale: boolean
  /** We have no road condition data for this route. */
  noData: boolean
}

export interface TripCamera {
  id: string
  name: string
  source: CameraSource
  status: CameraStatus
  /** Distance from Calgary along the route. */
  km: number
  lat: number
  lng: number
}

export interface TripWeather {
  stationId: number
  km: number
  airTempC: number | null
  pavementTempC: number | null
  windKmh: number | null
  windDirDeg: number | null
  observedAt: string
}

export interface TripSegment {
  id: number
  roadway: string
  location: string | null
  primaryCondition: string
  secondaryConditions: string[]
  visibility: string | null
  level: TripLevel
  findings: Array<{ level: TripRuleLevel; text: string }>
  fromKm: number
  toKm: number
  updatedAt: string
  weather: TripWeather | null
  /** [lng, lat] lines, for the map. */
  path: [number, number][][]
}

export interface TripEvent {
  id: number
  roadway: string | null
  description: string
  label: string
  level: TripRuleLevel
  direction: string | null
  km: number
  lat: number
  lng: number
  startsAt: string
  endsAt: string | null
  /** Starts later (within the next 12 hours). */
  upcoming: boolean
}

export interface TripReport {
  trip: {
    id: TripId
    name: string
    highway: string
    from: string
    to: string
    lengthKm: number
  }
  verdict: TripVerdict
  /** When our road data was last refreshed from 511 (null: never). */
  dataUpdatedAt: string | null
  generatedAt: string
  route: {
    /** [lng, lat] */
    coordinates: [number, number][]
    places: Array<{ name: string; km: number }>
  }
  cameras: TripCamera[]
  segments: TripSegment[]
  events: TripEvent[]
}
