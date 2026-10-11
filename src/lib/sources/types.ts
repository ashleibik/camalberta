import type { Area } from "./areas"
import type { CameraSource } from "@/lib/db/schema"

/**
 * A camera after an adapter has normalized it, before it is written to the DB.
 * `id` is our own stable identifier, `${source}:${sourceId}`.
 */
export interface NormalizedCamera {
  id: string
  source: CameraSource
  sourceId: string
  name: string
  road: string | null
  direction: string | null
  quadrant: string | null
  area: Area
  lat: number
  lng: number
  imageUrl: string
}

export interface Adapter {
  readonly source: CameraSource
  /**
   * Whether this source is usable right now. False means not configured (e.g.
   * a missing API key); sync skips it entirely and leaves its rows untouched.
   * Defaults to true when omitted.
   */
  isEnabled?(): boolean
  /**
   * Fetch, validate and normalize this source's cameras. Throws on network or
   * validation failure so the sync can report it per source.
   */
  fetch(): Promise<NormalizedCamera[]>
}

export function buildId(source: CameraSource, sourceId: string): string {
  return `${source}:${sourceId}`
}
