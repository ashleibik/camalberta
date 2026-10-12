import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fetchCameraImage, getCameraImage, type FetchLike } from "./image"

const CAM = {
  id: "calgary:loc1",
  source: "calgary" as const,
  imageUrl: "http://trafficcam.calgary.ca/loc1.jpg",
}

function imageResponse(
  contentType: string,
  byteLength = 1024,
  lastModified?: number
): Response {
  const headers: Record<string, string> = { "content-type": contentType }
  if (lastModified !== undefined) {
    headers["last-modified"] = new Date(lastModified).toUTCString()
  }
  return new Response(new Uint8Array(byteLength), { status: 200, headers })
}

const resetCache = () => {
  const g = globalThis as {
    __camyycImageCache?: unknown
    __camyycImageTiming?: unknown
  }
  g.__camyycImageCache = undefined
  g.__camyycImageTiming = undefined
}

describe("fetchCameraImage", () => {
  it("blocks a url whose host is not on the source allowlist", async () => {
    const result = await fetchCameraImage(
      { source: "calgary", imageUrl: "https://evil.example.com/x.jpg" },
      vi.fn()
    )
    expect(result).toEqual({ ok: false, reason: "blocked" })
  })

  it("passes through a jpeg", async () => {
    const result = await fetchCameraImage(CAM, async () =>
      imageResponse("image/jpeg")
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.contentType).toBe("image/jpeg")
  })

  it("normalizes image/jpg to image/jpeg", async () => {
    const result = await fetchCameraImage(CAM, async () =>
      imageResponse("image/jpg; charset=binary")
    )
    expect(result.ok && result.contentType).toBe("image/jpeg")
  })

  it("accepts png", async () => {
    const result = await fetchCameraImage(
      { source: "alberta511", imageUrl: "https://511.alberta.ca/map/Cctv/11" },
      async () => imageResponse("image/png")
    )
    expect(result.ok && result.contentType).toBe("image/png")
  })

  it("rejects a non-image content type", async () => {
    const result = await fetchCameraImage(CAM, async () =>
      imageResponse("text/html")
    )
    expect(result).toEqual({ ok: false, reason: "bad_type" })
  })

  it("rejects a non-200 response", async () => {
    const result = await fetchCameraImage(
      CAM,
      async () => new Response(null, { status: 503 })
    )
    expect(result).toEqual({ ok: false, reason: "bad_status" })
  })

  it("reports a timeout", async () => {
    const result = await fetchCameraImage(CAM, async () => {
      throw new DOMException("timed out", "TimeoutError")
    })
    expect(result).toEqual({ ok: false, reason: "timeout" })
  })

  it("refuses an upstream redirect to another host", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        })
    )
    const result = await fetchCameraImage(CAM, fetchImpl)
    expect(result).toEqual({ ok: false, reason: "blocked" })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("rejects an image over 3 MB", async () => {
    const result = await fetchCameraImage(CAM, async () =>
      imageResponse("image/jpeg", 3 * 1024 * 1024 + 1)
    )
    expect(result).toEqual({ ok: false, reason: "bad_size" })
  })

  it("rejects a suspiciously tiny body", async () => {
    const result = await fetchCameraImage(CAM, async () =>
      imageResponse("image/jpeg", 10)
    )
    expect(result).toEqual({ ok: false, reason: "bad_size" })
  })

  it("reads the photo time from Last-Modified", async () => {
    const taken = Date.parse("2026-10-11T23:23:09Z")
    const result = await fetchCameraImage(CAM, async () =>
      imageResponse("image/jpeg", 1024, taken)
    )
    expect(result.ok && result.lastModified).toBe(taken)
  })

  it("ignores a Last-Modified in the future", async () => {
    const future = Date.now() + 60 * 60_000
    const result = await fetchCameraImage(CAM, async () =>
      imageResponse("image/jpeg", 1024, future)
    )
    expect(result.ok && result.lastModified).toBeNull()
  })
})

describe("getCameraImage single-flight cache", () => {
  beforeEach(resetCache)

  it("coalesces concurrent requests into one upstream fetch", async () => {
    let calls = 0
    const slow: FetchLike = async () => {
      calls++
      return imageResponse("image/jpeg")
    }
    const [a, b] = await Promise.all([
      getCameraImage(CAM, slow),
      getCameraImage(CAM, slow),
    ])
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    expect(calls).toBe(1)
  })

  it("serves a cached success without re-fetching", async () => {
    let calls = 0
    const once: FetchLike = async () => {
      calls++
      return imageResponse("image/jpeg")
    }
    await getCameraImage(CAM, once)
    await getCameraImage(CAM, once)
    expect(calls).toBe(1)
  })

  it("a forced refresh re-checks upstream once the photo is 3s+ old", async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      const counting: FetchLike = async () => {
        calls++
        return imageResponse("image/jpeg")
      }
      await getCameraImage(CAM, counting)
      // Within 3s, a forced refresh shares the check we just made.
      vi.advanceTimersByTime(2_000)
      await getCameraImage(CAM, counting, { force: true })
      expect(calls).toBe(1)
      // Later (but still inside the cache window) it really checks again.
      vi.advanceTimersByTime(2_000)
      await getCameraImage(CAM, counting, { force: true })
      expect(calls).toBe(2)
      // A normal request after that is served from the new cache entry.
      await getCameraImage(CAM, counting)
      expect(calls).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not cache a failure", async () => {
    let calls = 0
    const flaky: FetchLike = async () => {
      calls++
      return calls === 1
        ? new Response(null, { status: 500 })
        : imageResponse("image/jpeg")
    }
    const first = await getCameraImage(CAM, flaky)
    const second = await getCameraImage(CAM, flaky)
    expect(first.ok).toBe(false)
    expect(second.ok).toBe(true)
    expect(calls).toBe(2)
  })
})

describe("getCameraImage publish-rhythm timing", () => {
  // A fixed "now" on a whole second (HTTP dates have 1s precision).
  const NOW = Date.parse("2026-10-11T23:30:00Z")

  beforeEach(() => {
    resetCache()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const at =
    (lastModified: number): FetchLike =>
    async () =>
      imageResponse("image/jpeg", 1024, lastModified)

  it("expires the cache when the next photo is due (default 60s rhythm)", async () => {
    // Photo taken 50s ago -> next due in 10s (+2s grace).
    const result = await getCameraImage(CAM, at(NOW - 50_000))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.intervalMs).toBe(60_000)
    expect(result.nextAt).toBe(NOW - 50_000 + 60_000 + 2_000)
    expect(result.expiresAt).toBe(NOW + 12_000)
  })

  it("never caches longer than 30s", async () => {
    // Photo taken just now -> next due in 62s, but the cap is 30s.
    const result = await getCameraImage(CAM, at(NOW))
    expect(result.ok && result.expiresAt).toBe(NOW + 30_000)
  })

  it("re-checks a late photo every 5s", async () => {
    // Taken 70s ago: next was due 8s ago (less than one interval late).
    const result = await getCameraImage(CAM, at(NOW - 70_000))
    expect(result.ok && result.expiresAt).toBe(NOW + 5_000)
  })

  it("learns the publication delay while checking closely", async () => {
    // Late photo -> we re-check 5s later and the new one has appeared.
    await getCameraImage(CAM, at(NOW - 70_000))
    vi.setSystemTime(NOW + 5_000)
    const result = await getCameraImage(CAM, at(NOW - 10_000))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.intervalMs).toBe(60_000)
    // Published 15s after capture: next = capture + 60s + 15s + 2s grace.
    expect(result.nextAt).toBe(NOW - 10_000 + 60_000 + 15_000 + 2_000)
  })

  it("does not mistake an idle stretch for the camera's interval", async () => {
    await getCameraImage(CAM, at(NOW - 10_000))
    // Nobody watched for 6 hours; the photo now is 6h newer.
    const sixHours = 6 * 60 * 60_000
    vi.setSystemTime(NOW + sixHours)
    const result = await getCameraImage(CAM, at(NOW + sixHours - 20_000))
    expect(result.ok && result.intervalMs).toBe(60_000)
  })

  it("tries 1s earlier after catching a photo on time", async () => {
    await getCameraImage(CAM, at(NOW - 70_000))
    vi.setSystemTime(NOW + 5_000)
    await getCameraImage(CAM, at(NOW - 10_000)) // learns a 15s delay
    vi.setSystemTime(NOW + 67_000)
    // Next photo is there on the first check: the delay steps down to 14s.
    const result = await getCameraImage(CAM, at(NOW + 50_000))
    expect(result.ok && result.nextAt).toBe(
      NOW + 50_000 + 60_000 + 14_000 + 2_000
    )
  })

  it("backs off to 30s for a camera frozen upstream", async () => {
    const result = await getCameraImage(CAM, at(NOW - 3 * 60 * 60_000))
    expect(result.ok && result.expiresAt).toBe(NOW + 30_000)
  })

  it("learns the interval from consecutive photos", async () => {
    await getCameraImage(CAM, at(NOW - 40_000))
    // Move past the cache window and see a photo 45s newer.
    vi.setSystemTime(NOW + 31_000)
    const result = await getCameraImage(CAM, at(NOW + 5_000))
    expect(result.ok && result.intervalMs).toBe(45_000)
  })

  it("ignores an older photo from a lagging upstream node", async () => {
    await getCameraImage(CAM, at(NOW - 10_000))
    vi.setSystemTime(NOW + 31_000)
    // Upstream hands back an *older* photo: no negative gap is learned.
    const older = await getCameraImage(CAM, at(NOW - 70_000))
    expect(older.ok && older.intervalMs).toBe(60_000)
    vi.setSystemTime(NOW + 62_000)
    // The next real photo is measured from the newest one we had seen.
    const next = await getCameraImage(CAM, at(NOW + 50_000))
    expect(next.ok && next.intervalMs).toBe(60_000)
  })
})
