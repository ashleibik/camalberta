import { afterAll, describe, expect, it, vi } from "vitest"

// /api/collect in production without the R2 bucket: Vercel's disk is
// read-only, so it must refuse (503) rather than fail every camera, and
// only after the login check. Nothing may touch the database.
const SECRET = "c".repeat(40)

type DbGlobal = typeof globalThis & { __camalbertaDb?: unknown }
;(globalThis as DbGlobal).__camalbertaDb = new Proxy(
  {},
  {
    get() {
      throw new Error("the database must not be touched")
    },
  }
)

afterAll(() => {
  ;(globalThis as DbGlobal).__camalbertaDb = undefined
  vi.unstubAllEnvs()
})

describe("/api/collect in production", () => {
  it("needs the secret first, then answers 503 without storage", async () => {
    vi.resetModules()
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("CRON_SECRET", SECRET)
    for (const key of [
      "S3_ENDPOINT",
      "S3_BUCKET",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
    ]) {
      vi.stubEnv(key, "")
    }
    const { POST } = await import("@/app/api/collect/route")
    const call = (headers: Record<string, string> = {}) =>
      POST(
        new Request("https://camalberta.test/api/collect", {
          method: "POST",
          headers: { "x-real-ip": "198.51.100.9", ...headers },
        })
      )

    expect((await call()).status).toBe(401)
    expect((await call({ authorization: "Bearer wrong" })).status).toBe(401)
    const response = await call({ authorization: `Bearer ${SECRET}` })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: "Snapshot storage is not configured",
    })
  })
})
