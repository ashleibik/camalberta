import type {
  CamerasGeoJSON,
  HealthResponse,
  PublicCamera,
  TripReport,
} from "@/lib/api-types"
import type { TripId } from "@/lib/trip/trips"

import type { ClientCamera } from "./types"

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) {
    throw new Error(`Request to ${url} failed (${res.status})`)
  }
  return (await res.json()) as T
}

export async function fetchCameras(): Promise<ClientCamera[]> {
  const geo = await getJson<CamerasGeoJSON>("/api/cameras")
  return geo.features.map((f) => ({
    ...f.properties,
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }))
}

export function fetchHealth(): Promise<HealthResponse> {
  return getJson<HealthResponse>("/api/health")
}

export function fetchTripReport(trip: TripId): Promise<TripReport> {
  return getJson<TripReport>(`/api/trips/${encodeURIComponent(trip)}`)
}

export function fetchCamera(id: string): Promise<PublicCamera> {
  return getJson<PublicCamera>(`/api/cameras/${encodeURIComponent(id)}`)
}

/**
 * The proxied snapshot URL for a camera. `bucket` shares the cache per 30s;
 * `refresh` asks the server to check upstream right now (a unique `r` keeps
 * shared caches from answering it).
 */
export function cameraImageUrl(
  id: string,
  bucket?: number,
  options: { refresh?: boolean; thumbnail?: boolean } = {}
): string {
  const params = new URLSearchParams()
  if (bucket !== undefined) params.set("t", String(bucket))
  // 320px wide, ~7 KB instead of ~176 KB: for small tiles like the strip.
  if (options.thumbnail) params.set("w", "320")
  if (options.refresh) {
    params.set("refresh", "1")
    params.set("r", String(Date.now()))
  }
  const query = params.toString()
  const base = `/api/cam/${encodeURIComponent(id)}/image`
  return query ? `${base}?${query}` : base
}

/** Our relayed live video playlist (HLS) for a video camera. */
export function cameraLiveUrl(id: string): string {
  return `/api/cam/${encodeURIComponent(id)}/live`
}
