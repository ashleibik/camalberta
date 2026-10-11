import "server-only"

import { z } from "zod"

import { env } from "@/lib/env"

import { classifyArea } from "./areas"
import { SOURCE_IMAGE_HOSTS } from "./hosts"
import { buildId, type Adapter, type NormalizedCamera } from "./types"

const ENDPOINT = "https://511.alberta.ca/api/v2/get/cameras"
const IMAGE_HOST = SOURCE_IMAGE_HOSTS.alberta511

// Shape from the documented schema and sample at
// https://511.alberta.ca/help/endpoint/cameras (see __fixtures__/alberta511.json).
// Pulling a live response needs a developer key (see TODO.md); until then this
// is validated against the documented sample, not a live pull.
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

export function normalizeAlberta511(
  records: readonly Alberta511Camera[]
): NormalizedCamera[] {
  const cameras: NormalizedCamera[] = []
  const seen = new Set<string>()

  for (const record of records) {
    const area = classifyArea(record.Latitude, record.Longitude)
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

      const base = record.Location || record.Roadway || `Camera ${record.Id}`
      const name =
        view.Description && view.Description !== base
          ? `${base} — ${view.Description}`
          : base

      cameras.push({
        id: buildId("alberta511", sourceId),
        source: "alberta511",
        sourceId,
        name,
        road: record.Roadway || null,
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
      throw new Error("ALBERTA_511_API_KEY is not set")
    }
    const url = new URL(ENDPOINT)
    url.searchParams.set("format", "json")
    url.searchParams.set("key", env.ALBERTA_511_API_KEY)

    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      throw new Error(`511 Alberta responded ${response.status}`)
    }
    const json: unknown = await response.json()
    const records = alberta511ResponseSchema.parse(json)
    return normalizeAlberta511(records)
  },
}
