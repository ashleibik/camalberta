import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import { describeSyncError, fetchFeedJson, SyncSourceError } from "./feed"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("fetchFeedJson", () => {
  it("parses a JSON feed", async () => {
    vi.stubGlobal("fetch", async () => Response.json([{ a: 1 }]))
    await expect(fetchFeedJson("Test feed", "https://x.test")).resolves.toEqual(
      [{ a: 1 }]
    )
  })

  it("refuses to follow redirects", async () => {
    const seen: RequestInit[] = []
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      seen.push(init)
      return Response.json([])
    })
    await fetchFeedJson("Test feed", "https://x.test")
    expect(seen[0]?.redirect).toBe("error")
  })

  it("reports a bad status by source name, never by URL", async () => {
    vi.stubGlobal("fetch", async () => new Response("down", { status: 503 }))
    const error = await fetchFeedJson(
      "Test feed",
      "https://x.test/feed?key=SECRET"
    ).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SyncSourceError)
    expect((error as Error).message).toBe("Test feed responded 503")
    expect((error as Error).message).not.toContain("SECRET")
  })

  it("rejects an oversized feed", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response("[]", { headers: { "content-length": String(6e6) } })
    )
    await expect(fetchFeedJson("Test feed", "https://x.test")).rejects.toThrow(
      "too large"
    )
  })
})

describe("describeSyncError", () => {
  it("passes our own messages through", () => {
    expect(
      describeSyncError(new SyncSourceError("511 Alberta responded 500"))
    ).toBe("511 Alberta responded 500")
  })

  it("hides validation details and raw errors behind generic reasons", () => {
    const zodError = z.object({ a: z.string() }).safeParse({ a: 1 }).error
    expect(describeSyncError(zodError)).toBe("upstream data failed validation")
    expect(
      describeSyncError(
        new TypeError("fetch failed: https://internal.example/feed?key=SECRET")
      )
    ).toBe("upstream request failed")
    expect(
      describeSyncError(new DOMException("timed out", "TimeoutError"))
    ).toBe("upstream timed out")
  })
})
