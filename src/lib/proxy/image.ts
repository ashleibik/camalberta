import "server-only"

import type { Camera } from "@/lib/db/schema"
import { isAllowedImageUrl } from "@/lib/sources/hosts"

const UPSTREAM_TIMEOUT_MS = 5_000
const CACHE_TTL_MS = 30_000
const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB
const MIN_IMAGE_BYTES = 64

// Only these pass through; anything else (HTML error pages, gifs, ...) becomes
// a placeholder. `image/jpg` is normalized to `image/jpeg`.
const ALLOWED_CONTENT_TYPES = new Map<string, string>([
  ["image/jpeg", "image/jpeg"],
  ["image/jpg", "image/jpeg"],
  ["image/png", "image/png"],
])

export interface ImageOk {
  ok: true
  bytes: Uint8Array
  contentType: string
}
export interface ImageErr {
  ok: false
  reason:
    "blocked" | "timeout" | "bad_status" | "bad_type" | "bad_size" | "error"
}
export type ImageResult = ImageOk | ImageErr

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/**
 * Fetch a camera's upstream image once, with a hard timeout and strict
 * validation. `fetchImpl` is injectable for tests. Never follows the stored
 * URL unless its host is on the source's allowlist.
 */
export async function fetchCameraImage(
  camera: Pick<Camera, "source" | "imageUrl">,
  fetchImpl: FetchLike = fetch
): Promise<ImageResult> {
  if (!isAllowedImageUrl(camera.source, camera.imageUrl)) {
    return { ok: false, reason: "blocked" }
  }

  let response: Response
  try {
    response = await fetchImpl(camera.imageUrl, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { accept: "image/jpeg,image/png,image/*" },
      redirect: "follow",
      cache: "no-store",
    })
  } catch (error) {
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError"
    return { ok: false, reason: timedOut ? "timeout" : "error" }
  }

  if (!response.ok) return { ok: false, reason: "bad_status" }

  const rawType = response.headers.get("content-type") ?? ""
  const normalizedType = ALLOWED_CONTENT_TYPES.get(
    rawType.split(";")[0]!.trim().toLowerCase()
  )
  if (!normalizedType) return { ok: false, reason: "bad_type" }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await response.arrayBuffer())
  } catch {
    return { ok: false, reason: "error" }
  }
  if (
    bytes.byteLength < MIN_IMAGE_BYTES ||
    bytes.byteLength > MAX_IMAGE_BYTES
  ) {
    return { ok: false, reason: "bad_size" }
  }

  return { ok: true, bytes, contentType: normalizedType }
}

// ---- 30s single-flight cache --------------------------------------------
// Repeated or concurrent requests for the same camera hit upstream at most
// once per window. This is the main protection for rate-limited upstreams,
// independent of any CDN.

interface CacheEntry {
  expiresAt: number
  promise: Promise<ImageResult>
}

type CacheGlobal = typeof globalThis & {
  __camyycImageCache?: Map<string, CacheEntry>
}

function cache(): Map<string, CacheEntry> {
  const g = globalThis as CacheGlobal
  g.__camyycImageCache ??= new Map()
  return g.__camyycImageCache
}

export async function getCameraImage(
  camera: Pick<Camera, "id" | "source" | "imageUrl">,
  fetchImpl: FetchLike = fetch
): Promise<ImageResult> {
  const store = cache()
  const now = Date.now()

  const existing = store.get(camera.id)
  if (existing && existing.expiresAt > now) {
    return existing.promise
  }

  const promise = fetchCameraImage(camera, fetchImpl)
  store.set(camera.id, { expiresAt: now + CACHE_TTL_MS, promise })

  const result = await promise
  if (!result.ok) {
    // Don't cache failures: let the next request retry immediately.
    const entry = store.get(camera.id)
    if (entry && entry.promise === promise) store.delete(camera.id)
  }

  // Bound memory: one entry per camera is expected, but guard anyway.
  if (store.size > 1000) {
    for (const [k, v] of store) {
      if (v.expiresAt <= now) store.delete(k)
    }
  }

  return result
}
