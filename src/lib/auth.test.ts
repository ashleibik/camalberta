import { afterEach, describe, expect, it, vi } from "vitest"

const SECRET = "s3cret-".repeat(6) // 42 chars, over the 32 minimum

/** Load auth.ts fresh with CRON_SECRET set (or unset) in the environment. */
async function loadAuth(secret: string | undefined) {
  vi.resetModules()
  vi.stubEnv("CRON_SECRET", secret ?? "")
  return import("./auth")
}

const withAuth = (value?: string) =>
  new Request("https://x.test/api/sync", {
    headers: value === undefined ? {} : { authorization: value },
  })

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("isAuthorized", () => {
  it("accepts the right bearer secret", async () => {
    const { isAuthorized } = await loadAuth(SECRET)
    expect(isAuthorized(withAuth(`Bearer ${SECRET}`))).toBe(true)
  })

  it("rejects a wrong, partial or missing secret", async () => {
    const { isAuthorized } = await loadAuth(SECRET)
    expect(isAuthorized(withAuth(`Bearer ${SECRET}x`))).toBe(false)
    expect(isAuthorized(withAuth(`Bearer ${SECRET.slice(0, -1)}`))).toBe(false)
    expect(isAuthorized(withAuth(SECRET))).toBe(false) // no "Bearer "
    expect(isAuthorized(withAuth())).toBe(false)
  })

  it("fails closed when CRON_SECRET is not set", async () => {
    const { isAuthorized } = await loadAuth(undefined)
    expect(isAuthorized(withAuth("Bearer "))).toBe(false)
    expect(isAuthorized(withAuth("Bearer undefined"))).toBe(false)
  })
})
