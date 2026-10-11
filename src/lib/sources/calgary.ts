import "server-only"

import { z } from "zod"

import { classifyArea } from "./areas"
import { SOURCE_IMAGE_HOSTS } from "./hosts"
import { buildId, type Adapter, type NormalizedCamera } from "./types"

const ENDPOINT = "https://data.calgary.ca/resource/k7p9-kppz.json?$limit=1000"

// Upstream image host. Both http and https are served. We reject any other
// host so a changed feed can't redirect us elsewhere (defense in depth; the
// proxy also never takes a URL from the client).
const IMAGE_HOST = SOURCE_IMAGE_HOSTS.calgary

// Shape built from the real response (see __fixtures__/calgary.json), not the
// docs. Extra `:@computed_region_*` fields are ignored by the schema.
const calgaryCameraSchema = z.object({
  camera_url: z.object({
    url: z.string().url(),
    description: z.string().optional(),
  }),
  camera_location: z.string().min(1),
  quadrant: z.string().optional(),
  point: z
    .object({
      type: z.literal("Point"),
      // GeoJSON order: [lng, lat].
      coordinates: z.tuple([z.number(), z.number()]),
    })
    .optional(),
})

export const calgaryResponseSchema = z.array(calgaryCameraSchema)
export type CalgaryCamera = z.infer<typeof calgaryCameraSchema>

/** `http://trafficcam.calgary.ca/loc65.jpg` -> `loc65` (stable image id). */
function sourceIdFromUrl(url: string): string | null {
  const match = /\/(loc\d+)\.jpg$/i.exec(url)
  return match ? match[1]!.toLowerCase() : null
}

export function normalizeCalgary(
  records: readonly CalgaryCamera[]
): NormalizedCamera[] {
  const cameras: NormalizedCamera[] = []
  const seen = new Set<string>()

  for (const record of records) {
    if (!record.point) continue

    let host: string
    try {
      host = new URL(record.camera_url.url).hostname.toLowerCase()
    } catch {
      continue
    }
    if (host !== IMAGE_HOST) continue

    const sourceId = sourceIdFromUrl(record.camera_url.url)
    if (!sourceId || seen.has(sourceId)) continue

    const [lng, lat] = record.point.coordinates
    const area = classifyArea(lat, lng)
    if (!area) continue

    seen.add(sourceId)
    cameras.push({
      id: buildId("calgary", sourceId),
      source: "calgary",
      sourceId,
      name: record.camera_location,
      road: record.camera_location,
      direction: null,
      quadrant: record.quadrant ?? null,
      area,
      lat,
      lng,
      imageUrl: record.camera_url.url,
    })
  }

  return cameras
}

export const calgaryAdapter: Adapter = {
  source: "calgary",
  async fetch() {
    const response = await fetch(ENDPOINT, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      throw new Error(`Calgary open data responded ${response.status}`)
    }
    const json: unknown = await response.json()
    const records = calgaryResponseSchema.parse(json)
    return normalizeCalgary(records)
  },
}
