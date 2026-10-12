import "server-only"

import { classifyArea } from "./areas"
import { SOURCE_IMAGE_HOSTS } from "./hosts"
import { buildId, type Adapter, type NormalizedCamera } from "./types"

const IMAGE_HOST = SOURCE_IMAGE_HOSTS.sunshine

// Banff Sunshine Village's public webcams, from
// https://www.skibanff.com/the-mountain/mountain-report/webcams (checked
// 2026-10-12). Each is a JPEG the resort updates about once a minute. The
// resort publishes no coordinates: positions are the lift top stations in
// OpenStreetMap. The Mount Assiniboine camera's mount isn't published, so it
// sits at the top of the Great Divide chair on Lookout Mountain (approximate).
interface SunshineCamera {
  /** Path segment on cameras.skibanff.com/dynamic/. */
  path: string
  name: string
  direction: string | null
  lat: number
  lng: number
}

export const SUNSHINE_CAMERAS: readonly SunshineCamera[] = [
  {
    path: "15m",
    name: "Sunshine Village: Standish Express unload",
    direction: null,
    lat: 51.071205,
    lng: -115.786549,
  },
  {
    path: "14m",
    name: "Sunshine Village: Strawberry Express unload",
    direction: null,
    lat: 51.071126,
    lng: -115.782058,
  },
  {
    path: "10m",
    name: "Sunshine Village: Aurora Cam (top of Wawa)",
    direction: "North",
    lat: 51.081338,
    lng: -115.791634,
  },
  {
    path: "17m",
    name: "Sunshine Village: view of Mount Assiniboine",
    direction: "South",
    lat: 51.073847,
    lng: -115.754463,
  },
]

export function normalizeSunshine(
  list: readonly SunshineCamera[] = SUNSHINE_CAMERAS
): NormalizedCamera[] {
  const cameras: NormalizedCamera[] = []
  const seen = new Set<string>()

  for (const cam of list) {
    if (!/^[a-z0-9]+$/.test(cam.path) || seen.has(cam.path)) continue
    const area = classifyArea(cam.lat, cam.lng)
    if (!area) continue

    seen.add(cam.path)
    cameras.push({
      id: buildId("sunshine", cam.path),
      source: "sunshine",
      sourceId: cam.path,
      name: cam.name,
      road: null,
      direction: cam.direction,
      quadrant: null,
      area,
      lat: cam.lat,
      lng: cam.lng,
      imageUrl: `https://${IMAGE_HOST}/dynamic/${cam.path}`,
    })
  }

  return cameras
}

export const sunshineAdapter: Adapter = {
  source: "sunshine",
  // A curated list; see the note above.
  async fetch() {
    return normalizeSunshine()
  },
}
