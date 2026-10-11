import type {
  CamerasGeoJSON,
  HealthResponse,
  PublicCamera,
} from "@/lib/api-types"

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

export function fetchCamera(id: string): Promise<PublicCamera> {
  return getJson<PublicCamera>(`/api/cameras/${encodeURIComponent(id)}`)
}

/** The proxied snapshot URL for a camera. `bucket` shares the cache per 30s. */
export function cameraImageUrl(id: string, bucket?: number): string {
  const base = `/api/cam/${encodeURIComponent(id)}/image`
  return bucket === undefined ? base : `${base}?t=${bucket}`
}
