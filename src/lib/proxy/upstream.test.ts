import { describe, expect, it } from "vitest"

import { fetchUpstream, readBodyLimited, type FetchLike } from "./upstream"

const redirect = (location: string, status = 302) =>
  new Response(null, { status, headers: { location } })

/** Records every URL fetched and answers from a script. */
function scripted(answers: Record<string, () => Response>) {
  const calls: string[] = []
  const fetchImpl: FetchLike = async (input) => {
    calls.push(input)
    const answer = answers[input]
    return answer ? answer() : new Response("not found", { status: 404 })
  }
  return { calls, fetchImpl }
}

describe("fetchUpstream", () => {
  it("upgrades http to https before fetching", async () => {
    const { calls, fetchImpl } = scripted({
      "https://trafficcam.calgary.ca/loc1.jpg": () => new Response("ok"),
    })
    const res = await fetchUpstream(
      "calgary",
      "http://trafficcam.calgary.ca/loc1.jpg",
      {},
      fetchImpl
    )
    expect(res?.status).toBe(200)
    expect(calls).toEqual(["https://trafficcam.calgary.ca/loc1.jpg"])
  })

  it("never fetches a URL off the source's allowlist", async () => {
    const { calls, fetchImpl } = scripted({})
    const res = await fetchUpstream(
      "calgary",
      "https://169.254.169.254/latest/meta-data/",
      {},
      fetchImpl
    )
    expect(res).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it("follows a redirect on the same host", async () => {
    const { calls, fetchImpl } = scripted({
      "https://trafficcam.calgary.ca/old.jpg": () => redirect("/new.jpg", 301),
      "https://trafficcam.calgary.ca/new.jpg": () => new Response("ok"),
    })
    const res = await fetchUpstream(
      "calgary",
      "https://trafficcam.calgary.ca/old.jpg",
      {},
      fetchImpl
    )
    expect(res?.status).toBe(200)
    expect(calls).toHaveLength(2)
  })

  it("refuses a redirect to another host (SSRF)", async () => {
    for (const target of [
      "http://127.0.0.1:5432/",
      "https://evil.example.com/x.jpg",
      "https://trafficcam.calgary.ca.evil.com/x.jpg",
    ]) {
      const { calls, fetchImpl } = scripted({
        "https://trafficcam.calgary.ca/loc1.jpg": () => redirect(target),
      })
      const res = await fetchUpstream(
        "calgary",
        "https://trafficcam.calgary.ca/loc1.jpg",
        {},
        fetchImpl
      )
      expect(res).toBeNull()
      expect(calls).toHaveLength(1) // the redirect target is never fetched
    }
  })

  it("gives up after three redirects", async () => {
    let n = 0
    const fetchImpl: FetchLike = async () => redirect(`/loop${++n}.jpg`)
    const res = await fetchUpstream(
      "calgary",
      "https://trafficcam.calgary.ca/loop0.jpg",
      {},
      fetchImpl
    )
    expect(res).toBeNull()
    expect(n).toBe(4) // the first request plus three redirects
  })
})

describe("readBodyLimited", () => {
  it("returns a body within the limit", async () => {
    const bytes = await readBodyLimited(new Response("hello"), 10)
    expect(new TextDecoder().decode(bytes!)).toBe("hello")
  })

  it("stops reading a streamed body that passes the limit", async () => {
    let pulled = 0
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++
        controller.enqueue(new Uint8Array(1024))
      },
    })
    const bytes = await readBodyLimited(new Response(endless), 10 * 1024)
    expect(bytes).toBeNull()
    expect(pulled).toBeLessThan(20) // gave up early, didn't read forever
  })

  it("rejects a declared length over the limit without reading", async () => {
    const res = new Response("x".repeat(100), {
      headers: { "content-length": "100" },
    })
    expect(await readBodyLimited(res, 10)).toBeNull()
  })
})
