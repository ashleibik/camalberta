import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { clientIp, enforceRateLimit, rateLimit } from "./rate-limit"

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Fresh global map per test.
    ;(globalThis as { __camalbertaRateLimit?: unknown }).__camalbertaRateLimit =
      undefined
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("allows up to the limit then blocks", () => {
    const cfg = { limit: 3, windowMs: 1000 }
    expect(rateLimit("k", cfg).ok).toBe(true)
    expect(rateLimit("k", cfg).ok).toBe(true)
    expect(rateLimit("k", cfg).ok).toBe(true)
    const fourth = rateLimit("k", cfg)
    expect(fourth.ok).toBe(false)
    expect(fourth.remaining).toBe(0)
    expect(fourth.retryAfterSeconds).toBeGreaterThanOrEqual(1)
  })

  it("resets after the window elapses", () => {
    const cfg = { limit: 1, windowMs: 1000 }
    expect(rateLimit("k", cfg).ok).toBe(true)
    expect(rateLimit("k", cfg).ok).toBe(false)
    vi.advanceTimersByTime(1001)
    expect(rateLimit("k", cfg).ok).toBe(true)
  })

  it("tracks keys independently", () => {
    const cfg = { limit: 1, windowMs: 1000 }
    expect(rateLimit("a", cfg).ok).toBe(true)
    expect(rateLimit("b", cfg).ok).toBe(true)
    expect(rateLimit("a", cfg).ok).toBe(false)
  })

  it("stays bounded and fast under a flood of distinct keys", () => {
    const cfg = { limit: 1, windowMs: 60_000 }
    const started = performance.now()
    for (let i = 0; i < 200_000; i++) rateLimit(`flood-${i}`, cfg)
    const elapsed = performance.now() - started
    const store = (
      globalThis as { __camalbertaRateLimit?: Map<string, unknown> }
    ).__camalbertaRateLimit
    expect(store!.size).toBeLessThanOrEqual(50_001)
    // Amortized O(1) per request: a full scan per request would take minutes.
    expect(elapsed).toBeLessThan(3_000)
  })
})

describe("clientIp", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://x.test", { headers })

  it("prefers X-Real-IP, which the proxy sets", () => {
    expect(
      clientIp(
        req({ "x-real-ip": "198.51.100.2", "x-forwarded-for": "1.2.3.4" })
      )
    ).toBe("198.51.100.2")
  })

  it("takes the LAST X-Forwarded-For hop, not a client-supplied first one", () => {
    // The client sent "1.2.3.4" itself; the proxy appended the real address.
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.5" }))).toBe(
      "203.0.113.5"
    )
  })

  it("can't be used to pick a fresh bucket by spoofing the first hop", () => {
    const a = clientIp(req({ "x-forwarded-for": "9.9.9.1, 203.0.113.5" }))
    const b = clientIp(req({ "x-forwarded-for": "9.9.9.2, 203.0.113.5" }))
    expect(a).toBe(b)
  })

  it("falls back to unknown", () => {
    expect(clientIp(req({}))).toBe("unknown")
  })
})

describe("enforceRateLimit", () => {
  const from = (ip: string) =>
    new Request("https://x.test", { headers: { "x-real-ip": ip } })

  beforeEach(() => {
    ;(globalThis as { __camalbertaRateLimit?: unknown }).__camalbertaRateLimit =
      undefined
  })

  it("puts a whole IPv6 /64 in one bucket, like the admin lockout", () => {
    const cfg = { limit: 1, windowMs: 60_000 }
    expect(enforceRateLimit(from("2001:db8:aa:bb::1"), "t", cfg)).toBeNull()
    // Switching to another address in the same /64 doesn't reset the count.
    expect(enforceRateLimit(from("2001:db8:aa:bb::2"), "t", cfg)?.status).toBe(
      429
    )
    // Another /64, and each IPv4 address, still get a bucket of their own.
    expect(enforceRateLimit(from("2001:db8:aa:cc::1"), "t", cfg)).toBeNull()
    expect(enforceRateLimit(from("203.0.113.7"), "t", cfg)).toBeNull()
    expect(enforceRateLimit(from("203.0.113.8"), "t", cfg)).toBeNull()
  })
})
