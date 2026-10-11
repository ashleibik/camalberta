import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchCameraImage, getCameraImage, type FetchLike } from "./image"

const CAM = {
  id: "calgary:loc1",
  source: "calgary" as const,
  imageUrl: "http://trafficcam.calgary.ca/loc1.jpg",
}

function imageResponse(contentType: string, byteLength = 1024): Response {
  return new Response(new Uint8Array(byteLength), {
    status: 200,
    headers: { "content-type": contentType },
  })
}

const resetCache = () => {
  ;(globalThis as { __camyycImageCache?: unknown }).__camyycImageCache =
    undefined
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

  it("rejects a suspiciously tiny body", async () => {
    const result = await fetchCameraImage(CAM, async () =>
      imageResponse("image/jpeg", 10)
    )
    expect(result).toEqual({ ok: false, reason: "bad_size" })
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
