import "server-only"

import { env } from "@/lib/env"

/**
 * In-memory fixed-window rate limiter. Good for a single instance (and dev).
 * On multi-instance serverless each instance keeps its own window, so this is
 * a floor, not a global cap; swap in a shared store (e.g. Upstash Redis) for a
 * strict global limit. See TODO.md.
 */

export interface RateLimitConfig {
  limit: number
  windowMs: number
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  limit: number
  retryAfterSeconds: number
}

interface Window {
  count: number
  resetAt: number
}

// Survive dev hot reloads so the window isn't reset on every edit.
type RlGlobal = typeof globalThis & {
  __camalbertaRateLimit?: Map<string, Window>
  __camalbertaRateLimitSweptAt?: number
}

// Memory bounds. Sweeping expired windows is O(keys), so it runs at most every
// SWEEP_EVERY_MS once the map is big, never on every request: a flood of
// distinct keys must not turn each request into a full scan (CPU DoS).
// Local dev has no proxy, so every tab and tool shares one "unknown" client
// bucket and a few open tabs can trip the limits. Scale them up in
// development only; production limits are exactly as configured.
const LIMIT_SCALE = env.NODE_ENV === "development" ? 20 : 1

const SWEEP_ABOVE = 10_000
const SWEEP_EVERY_MS = 10_000
const MAX_KEYS = 50_000
// When over MAX_KEYS, evict down to this (oldest first) so it doesn't repeat.
const EVICT_TO = 40_000

function store(): Map<string, Window> {
  const g = globalThis as RlGlobal
  g.__camalbertaRateLimit ??= new Map()
  return g.__camalbertaRateLimit
}

function sweep(windows: Map<string, Window>, now: number): void {
  const g = globalThis as RlGlobal
  const overCap = windows.size > MAX_KEYS
  const due =
    windows.size > SWEEP_ABOVE &&
    now - (g.__camalbertaRateLimitSweptAt ?? 0) >= SWEEP_EVERY_MS
  if (!overCap && !due) return
  g.__camalbertaRateLimitSweptAt = now

  for (const [k, w] of windows) {
    if (w.resetAt <= now) windows.delete(k)
  }
  // Still too many live windows (a flood within one window): drop the oldest.
  // Maps iterate in insertion order. This can reset some clients' counts
  // early, which fails open for rate limiting but keeps memory bounded.
  if (windows.size > MAX_KEYS) {
    for (const k of windows.keys()) {
      if (windows.size <= EVICT_TO) break
      windows.delete(k)
    }
  }
}

export function rateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const limit = config.limit * LIMIT_SCALE
  const { windowMs } = config
  const windows = store()
  const now = Date.now()
  sweep(windows, now)

  let window = windows.get(key)
  if (!window || window.resetAt <= now) {
    window = { count: 0, resetAt: now + windowMs }
    windows.set(key, window)
  }
  window.count++

  const ok = window.count <= limit
  return {
    ok,
    remaining: Math.max(0, limit - window.count),
    limit,
    retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
  }
}

/**
 * The client's IP as reported by our reverse proxy: X-Real-IP, else the LAST
 * X-Forwarded-For entry (the one our proxy appended), else "unknown".
 *
 * Never the first X-Forwarded-For entry: a client can send that header
 * itself, and proxies that append (like nginx's $proxy_add_x_forwarded_for)
 * keep the client's value in front, so trusting it would let anyone pick a
 * fresh rate-limit bucket per request. Vercel overwrites both headers with
 * the real address. When self-hosting, run behind a proxy that sets them.
 */
export function clientIp(request: Request): string {
  return clientIpFromHeaders(request.headers)
}

/** `clientIp` for code that has headers but no Request (server actions). */
export function clientIpFromHeaders(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim()
  if (realIp) return realIp
  const xff = headers.get("x-forwarded-for")
  if (xff) {
    const last = xff.split(",").at(-1)?.trim()
    if (last) return last
  }
  return "unknown"
}

/**
 * Enforce a limit for a request. Returns a 429 Response when exceeded (with
 * Retry-After and rate-limit headers), or null when the request may proceed.
 */
export function enforceRateLimit(
  request: Request,
  bucket: string,
  config: RateLimitConfig
): Response | null {
  const result = rateLimit(`${bucket}:${clientIp(request)}`, config)
  if (result.ok) return null
  return Response.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "RateLimit-Limit": String(result.limit),
        "RateLimit-Remaining": String(result.remaining),
      },
    }
  )
}

/**
 * Shared limits, per client IP per minute.
 *
 * - `api`: each JSON route (one request returns every camera).
 * - `push`: subscribing to and unsubscribing from Trip Check alerts.
 * - `admin`: /admin pages, their snapshot images and label changes.
 * - The image proxy is stricter: a cap per camera (`imagePerCamera`) on top
 *   of an overall cap (`image`, sized for a 16-tile wall plus the detail
 *   panel). A viewer needs ~1-2 photos per camera per minute, up to ~12 while
 *   a late photo is being re-checked every 5s.
 * - Live video players reload the playlist and fetch a segment every ~2s
 *   (~60 requests/min per stream), so its caps are higher but also per
 *   stream (`videoPerCamera`) and overall (`video`, a 16-stream wall).
 *
 * These protect our server. The upstream camera hosts are protected by the
 * proxies' single-flight caches, which fetch each camera at most once per
 * window however many clients ask.
 */
export const RATE_LIMITS = {
  api: { limit: 60, windowMs: 60_000 },
  // Push subscribe/unsubscribe: a person needs a handful at most.
  push: { limit: 10, windowMs: 60_000 },
  // Admin pages (label review): a page of 24 snapshot images plus label
  // clicks, so higher than the JSON routes. The secret itself is 32+ random
  // characters, so this is about load, not guessing.
  admin: { limit: 300, windowMs: 60_000 },
  image: { limit: 200, windowMs: 60_000 },
  imagePerCamera: { limit: 30, windowMs: 60_000 },
  video: { limit: 1_200, windowMs: 60_000 },
  videoPerCamera: { limit: 120, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitConfig>
