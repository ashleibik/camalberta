import "server-only"

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
type RlGlobal = typeof globalThis & { __camyycRateLimit?: Map<string, Window> }

function store(): Map<string, Window> {
  const g = globalThis as RlGlobal
  g.__camyycRateLimit ??= new Map()
  return g.__camyycRateLimit
}

export function rateLimit(
  key: string,
  { limit, windowMs }: RateLimitConfig
): RateLimitResult {
  const windows = store()
  const now = Date.now()

  // Opportunistic cleanup so the map can't grow without bound.
  if (windows.size > 10_000) {
    for (const [k, w] of windows) {
      if (w.resetAt <= now) windows.delete(k)
    }
  }

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

/** First hop in X-Forwarded-For, else X-Real-IP, else "unknown". */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for")
  if (xff) {
    const first = xff.split(",")[0]?.trim()
    if (first) return first
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown"
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

/** Shared limits. The image proxy gets its own stricter bucket. */
export const RATE_LIMITS = {
  image: { limit: 200, windowMs: 60_000 },
  api: { limit: 60, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitConfig>
