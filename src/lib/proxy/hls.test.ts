import { beforeEach, describe, expect, it } from "vitest"

import {
  getLivePlaylist,
  getLiveSegment,
  isMpegTs,
  parseMediaPlaylist,
  renderPlaylist,
  streamCodeFromUrl,
  withoutOldest,
} from "./hls"
import type { FetchLike } from "./image"

const CODE = "WF05-6212-B834-BD83-1FC4_ab"
const PLAYLIST_URL = `https://cityed1-winkcdn1.winkcdn.com/2/public/hls/${CODE}.m3u8`
const CAM = {
  id: "edmonton:12",
  source: "edmonton" as const,
  imageUrl: PLAYLIST_URL,
}

/** Upstream's real format: a ring of 5 file names, 2s each. */
function upstreamPlaylist(mediaSequence: number): string {
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-TARGETDURATION:2",
    `#EXT-X-MEDIA-SEQUENCE:${mediaSequence}`,
  ]
  for (let i = 0; i < 5; i++) {
    lines.push("#EXTINF:2.000000,", `${CODE}${(mediaSequence + i) % 5}.ts`)
  }
  return lines.join("\n")
}

function tsBytes(packets = 3, marker = 0): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(188 * packets)
  for (let i = 0; i < packets; i++) bytes[i * 188] = 0x47
  bytes[1] = marker
  return bytes
}

const resetCaches = () => {
  const g = globalThis as { __camyycLive?: unknown; __camyycSegments?: unknown }
  g.__camyycLive = undefined
  g.__camyycSegments = undefined
}

describe("parseMediaPlaylist", () => {
  it("parses upstream's playlist with media sequence numbers", () => {
    const playlist = parseMediaPlaylist(upstreamPlaylist(5589), CODE)
    expect(playlist).not.toBeNull()
    expect(playlist!.targetDuration).toBe(2)
    expect(playlist!.segments.map((s) => s.seq)).toEqual([
      5589, 5590, 5591, 5592, 5593,
    ])
    expect(playlist!.segments[0]!.uri).toBe(`${CODE}4.ts`)
  })

  it("accepts CRLF line endings", () => {
    const text = upstreamPlaylist(10).replaceAll("\n", "\r\n")
    expect(parseMediaPlaylist(text, CODE)?.segments).toHaveLength(5)
  })

  it("rejects a segment that points anywhere else", () => {
    for (const uri of [
      "https://evil.example.com/x.ts",
      `../${CODE}1.ts`,
      `${CODE}1.ts?x=1`,
      "OTHER-CODE_ab1.ts",
    ]) {
      const text = [
        "#EXTM3U",
        "#EXT-X-TARGETDURATION:2",
        "#EXT-X-MEDIA-SEQUENCE:1",
        "#EXTINF:2.0,",
        uri,
      ].join("\n")
      expect(parseMediaPlaylist(text, CODE)).toBeNull()
    }
  })

  it("rejects master playlists, encryption and init segments", () => {
    for (const tag of [
      "#EXT-X-STREAM-INF:BANDWIDTH=1",
      '#EXT-X-KEY:METHOD=AES-128,URI="https://evil.example.com/k"',
      '#EXT-X-MAP:URI="init.mp4"',
    ]) {
      const text = upstreamPlaylist(1).replace(
        "#EXT-X-VERSION:3",
        `#EXT-X-VERSION:3\n${tag}`
      )
      expect(parseMediaPlaylist(text, CODE)).toBeNull()
    }
  })

  it("rejects text that is not a playlist", () => {
    expect(parseMediaPlaylist("<html>error</html>", CODE)).toBeNull()
    expect(parseMediaPlaylist("#EXTM3U\n", CODE)).toBeNull()
  })
})

describe("renderPlaylist", () => {
  it("rewrites segments to our own sequence-numbered URLs", () => {
    const playlist = parseMediaPlaylist(upstreamPlaylist(5589), CODE)!
    const text = renderPlaylist(playlist, (seq) => `/api/cam/x/live/${seq}.ts`)
    expect(text).toContain("#EXT-X-MEDIA-SEQUENCE:5589")
    expect(text).toContain("/api/cam/x/live/5593.ts")
    expect(text).not.toContain(CODE)
    expect(text).not.toContain("winkcdn")
  })
})

describe("withoutOldest", () => {
  it("drops the oldest segment and shifts the sequence numbers", () => {
    const playlist = withoutOldest(
      parseMediaPlaylist(upstreamPlaylist(5589), CODE)!
    )
    expect(playlist?.mediaSequence).toBe(5590)
    expect(playlist?.segments.map((s) => s.seq)).toEqual([
      5590, 5591, 5592, 5593,
    ])
  })

  it("counts a dropped discontinuity in the discontinuity sequence", () => {
    const text = upstreamPlaylist(10).replace(
      "#EXTINF",
      "#EXT-X-DISCONTINUITY\n#EXTINF"
    )
    const playlist = withoutOldest(parseMediaPlaylist(text, CODE)!)
    expect(playlist?.discontinuitySequence).toBe(1)
  })

  it("leaves nothing servable from a one-segment playlist", () => {
    const text = [
      "#EXTM3U",
      "#EXT-X-TARGETDURATION:2",
      "#EXT-X-MEDIA-SEQUENCE:1",
      "#EXTINF:2.0,",
      `${CODE}1.ts`,
    ].join("\n")
    expect(withoutOldest(parseMediaPlaylist(text, CODE)!)).toBeNull()
  })
})

describe("isMpegTs / streamCodeFromUrl", () => {
  it("recognizes MPEG-TS packets", () => {
    expect(isMpegTs(tsBytes())).toBe(true)
    expect(isMpegTs(new TextEncoder().encode("<html>".repeat(100)))).toBe(false)
    expect(isMpegTs(new Uint8Array(10))).toBe(false)
  })

  it("reads the stream code from a playlist URL", () => {
    expect(streamCodeFromUrl(PLAYLIST_URL)).toBe(CODE)
    expect(streamCodeFromUrl("https://x.example.com/a/b.m3u8")).toBeNull()
  })
})

describe("live relay caches", () => {
  beforeEach(resetCaches)

  function fakeUpstream(mediaSequence: () => number) {
    const calls: string[] = []
    const fetchImpl: FetchLike = async (input) => {
      calls.push(input)
      if (input.endsWith(".m3u8")) {
        return new Response(upstreamPlaylist(mediaSequence()), {
          headers: { "content-type": "application/vnd.apple.mpegurl" },
        })
      }
      return new Response(tsBytes(), {
        headers: { "content-type": "video/mp2t" },
      })
    }
    return { calls, fetchImpl }
  }

  it("fetches the upstream playlist once for many viewers", async () => {
    const { calls, fetchImpl } = fakeUpstream(() => 100)
    const results = await Promise.all(
      Array.from({ length: 5 }, () => getLivePlaylist(CAM, fetchImpl))
    )
    expect(results.every((r) => r.ok)).toBe(true)
    expect(calls.filter((c) => c.endsWith(".m3u8"))).toHaveLength(1)
  })

  it("prefetches the newest segments and serves them from cache", async () => {
    const { calls, fetchImpl } = fakeUpstream(() => 100)
    const result = await getLivePlaylist(CAM, fetchImpl)
    if (!result.ok) throw new Error("expected a playlist")
    await result.prefetch
    // Newest three of 100..104.
    expect(calls.filter((c) => c.endsWith(".ts"))).toHaveLength(3)

    const before = calls.length
    const bytes = await getLiveSegment(CAM, 104, fetchImpl)
    expect(bytes && isMpegTs(bytes)).toBe(true)
    expect(calls.length).toBe(before)
  })

  it("never lists or fetches the oldest segment (its file gets reused)", async () => {
    const { fetchImpl } = fakeUpstream(() => 100)
    const result = await getLivePlaylist(CAM, fetchImpl)
    expect(result.ok && result.playlist.segments.map((s) => s.seq)).toEqual([
      101, 102, 103, 104,
    ])
  })

  it("only fetches segments inside the servable window", async () => {
    const { fetchImpl } = fakeUpstream(() => 100)
    expect(await getLiveSegment(CAM, 100, fetchImpl)).toBeNull()
    expect(await getLiveSegment(CAM, 101, fetchImpl)).not.toBeNull()
    expect(await getLiveSegment(CAM, 105, fetchImpl)).toBeNull() // not yet
  })

  it("rejects a segment that isn't MPEG-TS", async () => {
    const fetchImpl: FetchLike = async (input) =>
      input.endsWith(".m3u8")
        ? new Response(upstreamPlaylist(1), {
            headers: { "content-type": "application/vnd.apple.mpegurl" },
          })
        : new Response("<html>nope</html>", {
            headers: { "content-type": "video/mp2t" },
          })
    expect(await getLiveSegment(CAM, 3, fetchImpl)).toBeNull()
  })

  it("fails closed for a camera whose stored URL is off the allowlist", async () => {
    const { calls, fetchImpl } = fakeUpstream(() => 1)
    const result = await getLivePlaylist(
      { ...CAM, imageUrl: "https://evil.example.com/2/public/hls/X_ab.m3u8" },
      fetchImpl
    )
    expect(result.ok).toBe(false)
    expect(calls).toHaveLength(0)
  })
})
