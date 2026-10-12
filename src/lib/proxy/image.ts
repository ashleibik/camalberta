import "server-only"

import type { Camera } from "@/lib/db/schema"
import { isAllowedImageUrl } from "@/lib/sources/hosts"

const UPSTREAM_TIMEOUT_MS = 5_000
const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB
const MIN_IMAGE_BYTES = 64

// Cache timing. Cameras take a still photo on a fixed rhythm (Calgary: every
// 60s, stamped hh:mm:09 in Last-Modified) but only *publish* it some time
// later (Calgary: ~35-45s after capture). We learn both per camera — the
// interval from successive Last-Modified stamps, the publication delay from
// when a new photo first shows up — and expire our cache right when the next
// photo should be available, never later than MAX_TTL_MS (the brief's 30s).
const MAX_TTL_MS = 30_000
const MIN_TTL_MS = 1_000
const DEFAULT_INTERVAL_MS = 60_000
const MIN_INTERVAL_MS = 15_000
const MAX_INTERVAL_MS = 10 * 60_000
// Wait this long past the predicted publish time before asking for the photo.
const PUBLISH_GRACE_MS = 2_000
// When a new photo is late, re-check at most this often. Once it is more than
// one interval late (likely frozen upstream) we back off to MAX_TTL_MS.
const OVERDUE_TTL_MS = 5_000
// How many recent photo gaps to remember when learning a camera's interval.
const MAX_GAPS = 4
// If the previous upstream check (which still had the old photo) was this
// recent, the moment a new photo appears tells us the publication delay.
const LAG_OBSERVE_WINDOW_MS = 15_000
// After catching a photo on time, try 1s earlier next time, so the estimate
// drifts back down if the camera starts publishing sooner.
const LAG_PROBE_STEP_MS = 1_000
// We only learn from a new photo if the previous check was this recent. After
// an idle stretch the gap spans many photos (e.g. 6 hours), which would
// otherwise be mistaken for the camera's interval. Covers the client's longest
// wait between checks (120s) plus slack.
const WATCH_CONTINUITY_MS = 150_000
// A forced re-check (the refresh button) reuses a check this recent, so
// button mashing can't hammer a camera's source.
const FORCE_MIN_AGE_MS = 3_000

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
  /** When upstream says this photo was taken (Last-Modified), if known. */
  lastModified: number | null
}
export interface ImageErr {
  ok: false
  reason:
    "blocked" | "timeout" | "bad_status" | "bad_type" | "bad_size" | "error"
}
export type ImageResult = ImageOk | ImageErr

/** A fetched image plus what the cache learned about the camera's rhythm. */
export interface CachedImageOk extends ImageOk {
  /** When the next photo is expected (plus grace), if predictable. */
  nextAt: number | null
  /** The camera's learned publish interval. */
  intervalMs: number
  /** When this cached copy expires; send as s-maxage. */
  expiresAt: number
}
export type CachedImageResult = CachedImageOk | ImageErr

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function parseLastModified(header: string | null, now: number): number | null {
  if (!header) return null
  const time = Date.parse(header)
  // Ignore missing or implausible (future) timestamps.
  if (!Number.isFinite(time) || time > now + 5 * 60_000) return null
  return time
}

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

  return {
    ok: true,
    bytes,
    contentType: normalizedType,
    lastModified: parseLastModified(
      response.headers.get("last-modified"),
      Date.now()
    ),
  }
}

// ---- Rhythm-aware single-flight cache ---------------------------------------
// Repeated or concurrent requests for the same camera hit upstream at most
// once per cache window. The window ends when the camera's next photo should
// be available, so viewers see it within seconds of publication instead of
// waiting out a fixed timer.

interface CacheEntry {
  expiresAt: number
  /** When the upstream check behind this entry started. */
  startedAt: number
  /** False while that check is still in flight. */
  settled: boolean
  promise: Promise<CachedImageResult>
}

/** What we know about a camera's publish rhythm, kept across cache entries. */
interface Timing {
  /** Newest photo capture time seen (Last-Modified). */
  lastModified: number | null
  /** Recent gaps between distinct photos; the smallest is the true cadence. */
  gaps: number[]
  /** Learned delay between a photo's capture and its publication. */
  lagMs: number
  /** When we last checked upstream for this camera. */
  lastFetchAt: number | null
}

type CacheGlobal = typeof globalThis & {
  __camyycImageCache?: Map<string, CacheEntry>
  __camyycImageTiming?: Map<string, Timing>
}

function cache(): Map<string, CacheEntry> {
  const g = globalThis as CacheGlobal
  g.__camyycImageCache ??= new Map()
  return g.__camyycImageCache
}

function timings(): Map<string, Timing> {
  const g = globalThis as CacheGlobal
  g.__camyycImageTiming ??= new Map()
  return g.__camyycImageTiming
}

/**
 * Update a camera's learned rhythm with a just-fetched photo.
 *
 * - Interval: the smallest recent gap between capture times, which is robust
 *   to skipped photos and to idle periods with nobody watching.
 * - Publication delay: when we were checking closely (the previous check,
 *   moments ago, still had the old photo), the moment the new photo shows up
 *   minus its capture time. When we instead catch a photo on the first try,
 *   the estimate steps 1s earlier so it can't stay too late forever.
 */
function learnRhythm(
  id: string,
  lastModified: number | null,
  fetchedAt: number
): { intervalMs: number; lagMs: number; newest: number | null } {
  const store = timings()
  const prev = store.get(id)
  const gaps = prev ? [...prev.gaps] : []
  let lagMs = prev?.lagMs ?? 0
  const prevNewest = prev?.lastModified ?? null

  const sinceLastCheck =
    prev?.lastFetchAt != null ? fetchedAt - prev.lastFetchAt : Infinity
  const watching = sinceLastCheck <= WATCH_CONTINUITY_MS

  if (
    watching &&
    lastModified !== null &&
    prevNewest !== null &&
    lastModified > prevNewest
  ) {
    gaps.push(lastModified - prevNewest)
    if (gaps.length > MAX_GAPS) gaps.shift()

    lagMs =
      sinceLastCheck <= LAG_OBSERVE_WINDOW_MS
        ? clamp(fetchedAt - lastModified, 0, MAX_INTERVAL_MS)
        : Math.max(0, lagMs - LAG_PROBE_STEP_MS)
  }

  // Never move the timestamp backwards: upstream sometimes hands back an
  // older photo than one we have already seen.
  const newest =
    prevNewest !== null && lastModified !== null
      ? Math.max(prevNewest, lastModified)
      : (lastModified ?? prevNewest)

  if (store.size > 2000) store.clear()
  store.set(id, { lastModified: newest, gaps, lagMs, lastFetchAt: fetchedAt })

  const intervalMs = gaps.length
    ? clamp(Math.min(...gaps), MIN_INTERVAL_MS, MAX_INTERVAL_MS)
    : DEFAULT_INTERVAL_MS
  return { intervalMs, lagMs, newest }
}

function withTiming(id: string, result: ImageOk): CachedImageOk {
  const now = Date.now()
  const { intervalMs, lagMs, newest } = learnRhythm(
    id,
    result.lastModified,
    now
  )

  if (newest === null) {
    return { ...result, nextAt: null, intervalMs, expiresAt: now + MAX_TTL_MS }
  }

  // Predict from the newest photo seen, even if upstream just served an older
  // one: next capture + publication delay + a little grace.
  const nextAt = newest + intervalMs + lagMs + PUBLISH_GRACE_MS
  const untilNext = nextAt - now
  let ttl: number
  if (untilNext > 0) ttl = clamp(untilNext, MIN_TTL_MS, MAX_TTL_MS)
  else if (-untilNext < intervalMs) ttl = OVERDUE_TTL_MS
  else ttl = MAX_TTL_MS // long overdue: likely frozen upstream, back off

  return { ...result, nextAt, intervalMs, expiresAt: now + ttl }
}

export async function getCameraImage(
  camera: Pick<Camera, "id" | "source" | "imageUrl">,
  fetchImpl: FetchLike = fetch,
  /** `force`: check upstream now (the refresh button), cache permitting. */
  options: { force?: boolean } = {}
): Promise<CachedImageResult> {
  const store = cache()
  const now = Date.now()

  const existing = store.get(camera.id)
  if (existing) {
    const reusable = options.force
      ? !existing.settled || now - existing.startedAt < FORCE_MIN_AGE_MS
      : existing.expiresAt > now
    if (reusable) return existing.promise
  }

  const promise = fetchCameraImage(camera, fetchImpl).then((result) =>
    result.ok ? withTiming(camera.id, result) : result
  )
  // Provisional expiry so concurrent requests share this fetch.
  store.set(camera.id, {
    expiresAt: now + MAX_TTL_MS,
    startedAt: now,
    settled: false,
    promise,
  })

  const result = await promise
  const entry = store.get(camera.id)
  if (entry && entry.promise === promise) {
    entry.settled = true
    if (result.ok) entry.expiresAt = result.expiresAt
    // Don't cache failures: let the next request retry immediately.
    else store.delete(camera.id)
  }

  // Bound memory: one entry per camera is expected, but guard anyway.
  if (store.size > 1000) {
    for (const [k, v] of store) {
      if (v.expiresAt <= Date.now()) store.delete(k)
    }
  }

  return result
}

/** A photo older than this means the camera is frozen upstream. */
export const STALE_PHOTO_MS = 10 * 60_000
