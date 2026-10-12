import "server-only"

import { z } from "zod"

import { classifyArea } from "./areas"
import { SOURCE_IMAGE_HOSTS } from "./hosts"
import { buildId, type Adapter, type NormalizedCamera } from "./types"

// The camera list the City of Edmonton's own traffic camera site
// (https://edmontontrafficcam.com) loads on every page view. Each camera is a
// live HLS video stream on the City's streaming CDN. The City's Conditions of
// Use (https://www.edmonton.ca/conditionsofuse) allow personal, educational
// and non-commercial use with the copyright notice shown.
const ENDPOINT = "https://edmontontrafficcam.com/Default.aspx/GetCameras"
const STREAM_HOST = SOURCE_IMAGE_HOSTS.edmonton

// Shape built from the real response (see __fixtures__/edmonton.json).
// Coordinates arrive as strings. Status "1" is online; the City's site shows
// 2 and 3 as unavailable.
const edmontonCameraSchema = z.object({
  Code: z.number().int().nonnegative(),
  Forge: z.number().int().min(0).max(99),
  Latitude: z.coerce.number().min(-90).max(90),
  Longitude: z.coerce.number().min(-180).max(180),
  MMSUrl: z.string().min(1).max(253),
  PrimaryRoad: z.string().min(1),
  SecondaryRoad: z.string().nullish(),
  Status: z.string(),
  // e.g. "WF05-6212-B834-BD83-1FC4_ab". Also the prefix of its segment names.
  StreamCode: z.string().regex(/^[A-Za-z0-9-]{1,64}_[a-z0-9]{1,8}$/),
})

export const edmontonResponseSchema = z.object({ d: z.array(z.unknown()) })
export type EdmontonCamera = z.infer<typeof edmontonCameraSchema>

/** Validate records one by one so a single odd camera can't sink the rest. */
export function parseEdmontonRecords(json: unknown): EdmontonCamera[] {
  const { d } = edmontonResponseSchema.parse(json)
  const records: EdmontonCamera[] = []
  for (const raw of d) {
    const parsed = edmontonCameraSchema.safeParse(raw)
    if (parsed.success) records.push(parsed.data)
  }
  return records
}

export function normalizeEdmonton(
  records: readonly EdmontonCamera[]
): NormalizedCamera[] {
  const cameras: NormalizedCamera[] = []
  const seen = new Set<string>()

  for (const record of records) {
    if (record.Status !== "1") continue
    if (record.MMSUrl.toLowerCase() !== STREAM_HOST) continue

    const area = classifyArea(record.Latitude, record.Longitude)
    if (!area) continue

    const sourceId = String(record.Code)
    if (seen.has(sourceId)) continue
    seen.add(sourceId)

    const secondary = record.SecondaryRoad?.trim()
    cameras.push({
      id: buildId("edmonton", sourceId),
      source: "edmonton",
      sourceId,
      name: secondary
        ? `${record.PrimaryRoad} & ${secondary}`
        : record.PrimaryRoad,
      road: record.PrimaryRoad,
      direction: null,
      quadrant: null,
      area,
      lat: record.Latitude,
      lng: record.Longitude,
      imageUrl: `https://${STREAM_HOST}/${record.Forge}/public/hls/${record.StreamCode}.m3u8`,
    })
  }

  return cameras
}

export const edmontonAdapter: Adapter = {
  source: "edmonton",
  async fetch() {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        accept: "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      throw new Error(`Edmonton traffic cameras responded ${response.status}`)
    }
    const json: unknown = await response.json()
    return normalizeEdmonton(parseEdmontonRecords(json))
  },
}
