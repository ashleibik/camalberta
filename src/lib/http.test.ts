import { describe, expect, it } from "vitest"
import { z } from "zod"

import { noQuery, parseQuery } from "./http"

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
