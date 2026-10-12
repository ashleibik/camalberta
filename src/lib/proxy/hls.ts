import "server-only"

import type { Camera } from "@/lib/db/schema"
import { isAllowedImageUrl } from "@/lib/sources/hosts"

import type { FetchLike } from "./image"

// Live video relay for HLS sources (City of Edmonton). The browser plays our
// own rewritten playlist and fetches segments from us; we fetch each upstream
// playlist at most once per second and each segment once per camera, however
// many people are watching. Nothing is kept beyond a few seconds of live video.

const UPSTREAM_TIMEOUT_MS = 5_000
const MAX_PLAYLIST_BYTES = 64 * 1024
const MAX_SEGMENT_BYTES = 8 * 1024 * 1024
// Upstream adds a segment every ~2s and viewers reload about that often.
const PLAYLIST_TTL_MS = 1_000
// Long enough for a slow viewer to catch a segment it saw in a playlist.
const SEGMENT_TTL_MS = 30_000
// Bounds memory: ~45 MB at Edmonton's ~156 KB segments.
const MAX_CACHED_SEGMENTS = 300
// How many of the newest segments to fetch ahead, so they are ready the moment
// a player asks (players start a few segments behind the live edge).
const PREFETCH_NEWEST = 3
const TS_PACKET_SIZE = 188
const TS_SYNC_BYTE = 0x47

export interface PlaylistSegment {
  /** Media sequence number: stable and unique while the stream runs. */
  seq: number
  duration: number
  /** Upstream file name, relative to the playlist. */
  uri: string
  discontinuity: boolean
}

export interface MediaPlaylist {
  targetDuration: number
  mediaSequence: number
  discontinuitySequence: number
  segments: PlaylistSegment[]
  ended: boolean
}

// Tags that would make a player fetch other URLs, or that we don't relay
// (variant playlists, encryption, fMP4 init segments, low-latency parts).
const REJECTED_TAGS = new Set([
  "#EXT-X-STREAM-INF",
  "#EXT-X-I-FRAME-STREAM-INF",
  "#EXT-X-MEDIA",
  "#EXT-X-KEY",
  "#EXT-X-SESSION-KEY",
  "#EXT-X-MAP",
  "#EXT-X-BYTERANGE",
  "#EXT-X-PART",
  "#EXT-X-PRELOAD-HINT",
  "#EXT-X-RENDITION-REPORT",
])

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function toNonNegativeInt(value: string): number | null {
  if (!/^\d{1,15}$/.test(value)) return null
  return Number(value)
}

/**
 * Parse an upstream HLS media playlist. Strict on purpose: every segment must
 * be a plain relative `<streamCode><n>.ts` file next to the playlist, and
 * anything that could point a player elsewhere rejects the whole playlist.
 */
export function parseMediaPlaylist(
  text: string,
  streamCode: string
): MediaPlaylist | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines[0] !== "#EXTM3U") return null

  const segmentName = new RegExp(`^${escapeRegExp(streamCode)}\\d{1,9}\\.ts$`)
  let targetDuration: number | null = null
  let mediaSequence = 0
  let discontinuitySequence = 0
  let ended = false
  let pendingDuration: number | null = null
  let pendingDiscontinuity = false
  const segments: PlaylistSegment[] = []

  for (const line of lines.slice(1)) {
    if (line.startsWith("#")) {
      const colon = line.indexOf(":")
      const tag = colon === -1 ? line : line.slice(0, colon)
      const value = colon === -1 ? "" : line.slice(colon + 1)
      if (REJECTED_TAGS.has(tag)) return null

      if (tag === "#EXT-X-TARGETDURATION") {
        targetDuration = toNonNegativeInt(value)
      } else if (tag === "#EXT-X-MEDIA-SEQUENCE") {
        const parsed = toNonNegativeInt(value)
        if (parsed === null || segments.length > 0) return null
        mediaSequence = parsed
      } else if (tag === "#EXT-X-DISCONTINUITY-SEQUENCE") {
        const parsed = toNonNegativeInt(value)
        if (parsed === null) return null
        discontinuitySequence = parsed
      } else if (tag === "#EXTINF") {
        const duration = Number(value.split(",")[0])
        if (!Number.isFinite(duration) || duration <= 0 || duration > 60) {
          return null
        }
        pendingDuration = duration
      } else if (tag === "#EXT-X-DISCONTINUITY") {
        pendingDiscontinuity = true
      } else if (tag === "#EXT-X-ENDLIST") {
        ended = true
      }
      // Other tags (VERSION, PROGRAM-DATE-TIME, ...) are dropped.
      continue
    }

    // A segment URI: must follow an #EXTINF and be one of this stream's files.
    if (pendingDuration === null || !segmentName.test(line)) return null
    segments.push({
      seq: mediaSequence + segments.length,
      duration: pendingDuration,
      uri: line,
      discontinuity: pendingDiscontinuity,
    })
    pendingDuration = null
    pendingDiscontinuity = false
  }

  if (targetDuration === null || targetDuration < 1 || targetDuration > 60) {
    return null
  }
  if (segments.length === 0 || segments.length > 50) return null
  return {
    targetDuration,
    mediaSequence,
    discontinuitySequence,
    segments,
    ended,
  }
}

/** Rebuild a playlist from parsed values, pointing segments at our routes. */
export function renderPlaylist(
  playlist: MediaPlaylist,
  segmentPath: (seq: number) => string
): string {
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${playlist.targetDuration}`,
    `#EXT-X-MEDIA-SEQUENCE:${playlist.mediaSequence}`,
  ]
  if (playlist.discontinuitySequence > 0) {
    lines.push(
      `#EXT-X-DISCONTINUITY-SEQUENCE:${playlist.discontinuitySequence}`
    )
  }
  for (const segment of playlist.segments) {
    if (segment.discontinuity) lines.push("#EXT-X-DISCONTINUITY")
    lines.push(`#EXTINF:${segment.duration.toFixed(3)},`)
    lines.push(segmentPath(segment.seq))
  }
  if (playlist.ended) lines.push("#EXT-X-ENDLIST")
  return `${lines.join("\n")}\n`
}

/**
 * Drop the oldest segment. Upstream reuses a small ring of file names and
 * starts writing the next segment over the oldest file before its playlist
 * moves on (measured on Edmonton's CDN), so the oldest entry can't be trusted:
 * we neither list it nor fetch it.
 */
export function withoutOldest(playlist: MediaPlaylist): MediaPlaylist | null {
  const [oldest, ...rest] = playlist.segments
  if (!oldest || rest.length === 0) return null
  return {
    ...playlist,
    mediaSequence: playlist.mediaSequence + 1,
    // Removing a segment that began with a discontinuity removes that tag.
    discontinuitySequence:
      playlist.discontinuitySequence + (oldest.discontinuity ? 1 : 0),
    segments: rest,
  }
}

/** Cheap check that bytes are an MPEG transport stream (188-byte packets). */
export function isMpegTs(bytes: Uint8Array): boolean {
  if (bytes.byteLength < TS_PACKET_SIZE) return false
  if (bytes[0] !== TS_SYNC_BYTE) return false
  if (
    bytes.byteLength >= 2 * TS_PACKET_SIZE &&
    bytes[TS_PACKET_SIZE] !== TS_SYNC_BYTE
  ) {
    return false
  }
  return true
}

/** `.../public/hls/WF05-...-1FC4_ab.m3u8` -> `WF05-...-1FC4_ab`. */
export function streamCodeFromUrl(url: string): string | null {
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return null
  }
  const match = /\/([A-Za-z0-9-]{1,64}_[a-z0-9]{1,8})\.m3u8$/.exec(pathname)
  return match ? match[1]! : null
}

// ---- Shared caches ------------------------------------------------------------

type LiveCamera = Pick<Camera, "id" | "source" | "imageUrl">

interface LiveState {
  playlist: MediaPlaylist | null
  fetchedAt: number
  pending: Promise<MediaPlaylist | null> | null
}

interface SegmentEntry {
  expiresAt: number
  promise: Promise<Uint8Array | null>
}

type HlsGlobal = typeof globalThis & {
  __camyycLive?: Map<string, LiveState>
  __camyycSegments?: Map<string, SegmentEntry>
}

function liveStates(): Map<string, LiveState> {
  const g = globalThis as HlsGlobal
  g.__camyycLive ??= new Map()
  return g.__camyycLive
}

function segmentStore(): Map<string, SegmentEntry> {
  const g = globalThis as HlsGlobal
  g.__camyycSegments ??= new Map()
  return g.__camyycSegments
}

function liveState(id: string): LiveState {
  const states = liveStates()
  let state = states.get(id)
  if (!state) {
    if (states.size > 2000) states.clear()
    state = { playlist: null, fetchedAt: 0, pending: null }
    states.set(id, state)
  }
  return state
}

function dropSegments(id: string): void {
  const store = segmentStore()
  for (const key of store.keys()) {
    if (key.startsWith(`${id}#`)) store.delete(key)
  }
}

function boundSegments(): void {
  const store = segmentStore()
  if (store.size <= MAX_CACHED_SEGMENTS) return
  const now = Date.now()
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key)
  }
  // Still too many: drop the oldest (Maps iterate in insertion order).
  for (const key of store.keys()) {
    if (store.size <= MAX_CACHED_SEGMENTS) break
    store.delete(key)
  }
}

async function fetchPlaylist(
  camera: LiveCamera,
  fetchImpl: FetchLike
): Promise<MediaPlaylist | null> {
  if (!isAllowedImageUrl(camera.source, camera.imageUrl)) return null
  const streamCode = streamCodeFromUrl(camera.imageUrl)
  if (!streamCode) return null

  let response: Response
  try {
    response = await fetchImpl(camera.imageUrl, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { accept: "application/vnd.apple.mpegurl" },
      // Never follow a redirect off the allowlisted host.
      redirect: "error",
      cache: "no-store",
    })
  } catch {
    return null
  }
  if (!response.ok) return null
  if (!/mpegurl/i.test(response.headers.get("content-type") ?? "")) return null
  if (Number(response.headers.get("content-length")) > MAX_PLAYLIST_BYTES) {
    return null
  }

  let text: string
  try {
    text = await response.text()
  } catch {
    return null
  }
  if (text.length > MAX_PLAYLIST_BYTES) return null
  return parseMediaPlaylist(text, streamCode)
}

async function fetchSegment(
  camera: LiveCamera,
  uri: string,
  fetchImpl: FetchLike
): Promise<Uint8Array | null> {
  let url: string
  try {
    url = new URL(uri, camera.imageUrl).toString()
  } catch {
    return null
  }
  if (!isAllowedImageUrl(camera.source, url)) return null

  let response: Response
  try {
    response = await fetchImpl(url, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { accept: "video/mp2t" },
      redirect: "error",
      cache: "no-store",
    })
  } catch {
    return null
  }
  if (!response.ok) return null
  const type = response.headers.get("content-type") ?? ""
  if (!/video\/mp2t|application\/octet-stream/i.test(type)) return null
  if (Number(response.headers.get("content-length")) > MAX_SEGMENT_BYTES) {
    return null
  }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await response.arrayBuffer())
  } catch {
    return null
  }
  if (bytes.byteLength > MAX_SEGMENT_BYTES || !isMpegTs(bytes)) return null
  return bytes
}

/** Single-flight fetch of one segment, cached for SEGMENT_TTL_MS. */
function loadSegment(
  camera: LiveCamera,
  segment: PlaylistSegment,
  fetchImpl: FetchLike
): Promise<Uint8Array | null> {
  const store = segmentStore()
  const key = `${camera.id}#${segment.seq}`
  const existing = store.get(key)
  if (existing && existing.expiresAt > Date.now()) return existing.promise

  const promise = fetchSegment(camera, segment.uri, fetchImpl).then((bytes) => {
    // Don't cache failures: let the next request retry.
    if (!bytes && store.get(key)?.promise === promise) store.delete(key)
    return bytes
  })
  store.set(key, { expiresAt: Date.now() + SEGMENT_TTL_MS, promise })
  boundSegments()
  return promise
}

export type LivePlaylistResult =
  | {
      ok: true
      playlist: MediaPlaylist
      /** Settles once the newest segments are cached (pass to `after`). */
      prefetch: Promise<unknown>
    }
  | { ok: false }

/**
 * The camera's current live playlist (minus the untrustworthy oldest
 * segment), fetched upstream at most once per second per camera. Also starts
 * fetching the newest segments so they are ready when players ask for them.
 */
export async function getLivePlaylist(
  camera: LiveCamera,
  fetchImpl: FetchLike = fetch
): Promise<LivePlaylistResult> {
  const state = liveState(camera.id)
  const cached = state.playlist
  if (cached && Date.now() - state.fetchedAt < PLAYLIST_TTL_MS) {
    return { ok: true, playlist: cached, prefetch: Promise.resolve() }
  }

  state.pending ??= fetchPlaylist(camera, fetchImpl)
    .catch(() => null)
    .then((upstream) => {
      state.pending = null
      const playlist = upstream && withoutOldest(upstream)
      if (playlist) {
        // A lower sequence means upstream restarted the stream and will
        // reuse old numbers: forget cached segments so none is replayed.
        if (
          state.playlist &&
          playlist.mediaSequence < state.playlist.mediaSequence
        ) {
          dropSegments(camera.id)
        }
        state.playlist = playlist
        state.fetchedAt = Date.now()
      }
      return playlist
    })

  const playlist = await state.pending
  if (!playlist) return { ok: false }

  const newest = playlist.segments.slice(-PREFETCH_NEWEST)
  const prefetch = Promise.allSettled(
    newest.map((segment) => loadSegment(camera, segment, fetchImpl))
  )
  return { ok: true, playlist, prefetch }
}

/**
 * One segment by media sequence number: from cache when we already have it,
 * otherwise fetched only while it is in the current (servable) window.
 */
export async function getLiveSegment(
  camera: LiveCamera,
  seq: number,
  fetchImpl: FetchLike = fetch
): Promise<Uint8Array | null> {
  const existing = segmentStore().get(`${camera.id}#${seq}`)
  if (existing && existing.expiresAt > Date.now()) return existing.promise

  const result = await getLivePlaylist(camera, fetchImpl)
  if (!result.ok) return null
  const segment = result.playlist.segments.find((s) => s.seq === seq)
  if (!segment) return null
  return loadSegment(camera, segment, fetchImpl)
}
