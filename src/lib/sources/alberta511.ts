import "server-only"

import { z } from "zod"

import { env } from "@/lib/env"
import { classifyCameraArea } from "@/lib/trip/corridors"

import { fetchFeedJson, SyncSourceError } from "./feed"
import { SOURCE_IMAGE_HOSTS } from "./hosts"
import { buildId, type Adapter, type NormalizedCamera } from "./types"

const ENDPOINT = "https://511.alberta.ca/api/v2/get/cameras"
const IMAGE_HOST = SOURCE_IMAGE_HOSTS.alberta511

// Shape from a real response (__fixtures__/alberta511.json, saved
// 2026-10-19; it matches the documented schema at
// https://511.alberta.ca/help/endpoint/cameras).
const viewSchema = z.object({
  Id: z.number().int(),
  Url: z.string().url(),
  Status: z.string(),
  Description: z.string().optional().default(""),
})

const cameraSchema = z.object({
  Id: z.number().int(),
  Source: z.string().optional().default(""),
  SourceId: z.string().optional().default(""),
  Roadway: z.string().optional().default(""),
  Direction: z.string().optional().default(""),
  Latitude: z.number().min(-90).max(90),
  Longitude: z.number().min(-180).max(180),
  Location: z.string().optional().default(""),
  Views: z.array(viewSchema).default([]),
})

export const alberta511ResponseSchema = z.array(cameraSchema)
export type Alberta511Camera = z.infer<typeof cameraSchema>

function cleanDirection(direction: string): string | null {
  const trimmed = direction.trim()
  if (!trimmed || /^unknown$/i.test(trimmed)) return null
  return trimmed
}

/** Real records use "N/A" (or "") for a missing roadway or view name. */
function cleanText(value: string): string {
  const trimmed = value.trim()
  return /^n\/a$/i.test(trimmed) ? "" : trimmed
}

export function normalizeAlberta511(
  records: readonly Alberta511Camera[]
): NormalizedCamera[] {
  const cameras: NormalizedCamera[] = []
  const seen = new Set<string>()

  for (const record of records) {
    // Box areas, or the QEII corridor between Calgary and Edmonton.
    const area = classifyCameraArea(record.Latitude, record.Longitude)
    if (!area) continue

    // One normalized camera per enabled view: a physical camera can expose
    // several directional views, each its own image.
    for (const view of record.Views) {
      if (!/^enabled$/i.test(view.Status)) continue

      let host: string
      try {
        host = new URL(view.Url).hostname.toLowerCase()
      } catch {
        continue
      }
      if (host !== IMAGE_HOST) continue

      const sourceId = `${record.Id}-${view.Id}`
      if (seen.has(sourceId)) continue
      seen.add(sourceId)

      const roadway = cleanText(record.Roadway)
      const description = cleanText(view.Description)
      const base =
        cleanText(record.Location) || roadway || `Camera ${record.Id}`
      const name =
        description && description !== base ? `${base} — ${description}` : base

      cameras.push({
        id: buildId("alberta511", sourceId),
        source: "alberta511",
        sourceId,
        name,
        road: roadway || null,
        direction: cleanDirection(record.Direction),
        quadrant: null,
        area,
        lat: record.Latitude,
        lng: record.Longitude,
        imageUrl: view.Url,
      })
    }
  }

  return cameras
}

export const alberta511Adapter: Adapter = {
  source: "alberta511",
  isEnabled() {
    return Boolean(env.ALBERTA_511_API_KEY)
  },
  async fetch() {
    if (!env.ALBERTA_511_API_KEY) {
      throw new SyncSourceError("511 Alberta is not configured")
    }
    // The key travels in the query string (511's API design), so this URL
    // must never be logged or returned; fetchFeedJson errors only name the
    // source.
    const url = new URL(ENDPOINT)
    url.searchParams.set("format", "json")
    url.searchParams.set("key", env.ALBERTA_511_API_KEY)

    const json = await fetchFeedJson("511 Alberta", url, {
      headers: { accept: "application/json" },
    })
    const records = alberta511ResponseSchema.parse(json)
    return normalizeAlberta511(records)
  },
}
