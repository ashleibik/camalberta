import { describe, expect, it } from "vitest"
import { z } from "zod"

import { noQuery, parseJsonBody, parseQuery } from "./http"

const req = (query: string) => new Request(`https://x.test/api/x${query}`)

describe("parseQuery", () => {
  it("accepts no parameters where none are expected", () => {
    expect(parseQuery(req(""), noQuery).ok).toBe(true)
  })

  it("rejects an unexpected parameter with a 400", async () => {
    const result = parseQuery(req("?url=https://evil.example.com"), noQuery)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(400)
      expect(await result.response.json()).toEqual({ error: "Invalid query" })
    }
  })

  it("rejects a repeated parameter", () => {
    const schema = z.strictObject({ t: z.string().optional() })
    expect(parseQuery(req("?t=1&t=2"), schema).ok).toBe(false)
    expect(parseQuery(req("?t=1"), schema).ok).toBe(true)
  })

  it("is not fooled by __proto__ keys", () => {
    const result = parseQuery(req("?__proto__=x"), noQuery)
    expect(result.ok).toBe(false)
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })
})

describe("parseJsonBody", () => {
  const schema = z.strictObject({ trip: z.literal("banff") })
  const post = (body: string, headers: Record<string, string> = {}) =>
    new Request("https://x.test/api/push/subscribe", {
      method: "POST",
      body,
      headers: {
        host: "x.test",
        "content-type": "application/json",
        ...headers,
      },
    })

  it("accepts a small same-origin JSON body that matches the schema", async () => {
    const result = await parseJsonBody(
      post('{"trip":"banff"}', {
        origin: "https://x.test",
        "sec-fetch-site": "same-origin",
      }),
      schema
    )
    expect(result).toEqual({ ok: true, data: { trip: "banff" } })
  })

  it("rejects cross-site requests (CSRF) with a 403", async () => {
    const crossSite = await parseJsonBody(
      post('{"trip":"banff"}', { "sec-fetch-site": "cross-site" }),
      schema
    )
    expect(!crossSite.ok && crossSite.response.status).toBe(403)
    const otherOrigin = await parseJsonBody(
      post('{"trip":"banff"}', { origin: "https://evil.example" }),
      schema
    )
    expect(!otherOrigin.ok && otherOrigin.response.status).toBe(403)
  })

  it("requires application/json (415)", async () => {
    const result = await parseJsonBody(
      post('{"trip":"banff"}', { "content-type": "text/plain" }),
      schema
    )
    expect(!result.ok && result.response.status).toBe(415)
  })

  it("rejects a body over the size cap (413) without buffering it all", async () => {
    const result = await parseJsonBody(
      post(`{"trip":"${"x".repeat(5000)}"}`),
      schema
    )
    expect(!result.ok && result.response.status).toBe(413)
  })

  it("rejects invalid JSON and unknown fields (400)", async () => {
    const broken = await parseJsonBody(post("{trip"), schema)
    expect(!broken.ok && broken.response.status).toBe(400)
    const extra = await parseJsonBody(post('{"trip":"banff","x":1}'), schema)
    expect(!extra.ok && extra.response.status).toBe(400)
  })
})
