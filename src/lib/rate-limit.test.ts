import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { clientIp, rateLimit } from "./rate-limit"

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Fresh global map per test.
    ;(globalThis as { __camyycRateLimit?: unknown }).__camyycRateLimit =
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
})

describe("clientIp", () => {
  it("takes the first X-Forwarded-For hop", () => {
    const req = new Request("https://x.test", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" },
    })
    expect(clientIp(req)).toBe("203.0.113.5")
  })

  it("falls back to X-Real-IP then unknown", () => {
    expect(
      clientIp(
        new Request("https://x.test", {
          headers: { "x-real-ip": "198.51.100.2" },
        })
      )
    ).toBe("198.51.100.2")
    expect(clientIp(new Request("https://x.test"))).toBe("unknown")
  })
})
