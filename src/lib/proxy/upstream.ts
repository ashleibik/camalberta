import "server-only"

import type { CameraSource } from "@/lib/db/schema"
import { isAllowedImageUrl } from "@/lib/sources/hosts"

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

const MAX_REDIRECTS = 3

/**
 * Read a response body, giving up (null) as soon as it passes `maxBytes`.
 * Streams instead of buffering first, so an oversized or endless upstream
 * response can't exhaust our memory.
 */
export async function readBodyLimited(
  response: Response,
  maxBytes: number
): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > maxBytes) {
    void response.body?.cancel().catch(() => {})
    return null
  }
  if (!response.body) return new Uint8Array(0)

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        void reader.cancel().catch(() => {})
        return null
      }
      chunks.push(value)
    }
  } catch {
    return null
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/** `http:` URLs become `https:` (every camera host we use serves https). */
function toHttps(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === "http:") parsed.protocol = "https:"
    return parsed.toString()
  } catch {
    return null
  }
}

/**
 * Fetch a camera's upstream URL safely, or null if it isn't allowed:
 * - always over https (no plain-http hop anyone on the path could tamper with)
 * - only to the source's allowlisted host
 * - redirects are followed by hand, at most 3, and each target is checked
 *   again, so a redirect can never take the server to another host (SSRF).
 * Network errors and timeouts still throw, for the caller to classify.
 */
export async function fetchUpstream(
  source: CameraSource,
  url: string,
  init: RequestInit,
  fetchImpl: FetchLike = fetch
): Promise<Response | null> {
  let current = toHttps(url)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!current || !isAllowedImageUrl(source, current)) return null

    const response = await fetchImpl(current, { ...init, redirect: "manual" })
    const isRedirect =
      response.status >= 300 && response.status < 400 && response.status !== 304
    if (!isRedirect) return response

    const location = response.headers.get("location")
    void response.body?.cancel().catch(() => {})
    if (!location) return null
    try {
      current = toHttps(new URL(location, current).toString())
    } catch {
      return null
    }
  }
  return null
}
