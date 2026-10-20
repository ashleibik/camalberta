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

describe("isAdminAuthorized", () => {
  const basic = (user: string, pass: string) =>
    `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`

  it("accepts Basic auth with the secret as the password, any user name", async () => {
    const { isAdminAuthorized } = await loadAuth(SECRET)
    expect(isAdminAuthorized(basic("admin", SECRET))).toBe(true)
    expect(isAdminAuthorized(basic("", SECRET))).toBe(true)
    expect(isAdminAuthorized(`Bearer ${SECRET}`)).toBe(true)
  })

  it("rejects a wrong password, malformed headers and no header", async () => {
    const { isAdminAuthorized } = await loadAuth(SECRET)
    expect(isAdminAuthorized(basic("admin", `${SECRET}x`))).toBe(false)
    expect(isAdminAuthorized(basic(SECRET, "wrong"))).toBe(false)
    expect(isAdminAuthorized("Basic not base64!")).toBe(false)
    expect(
      isAdminAuthorized(`Basic ${Buffer.from(SECRET).toString("base64")}`)
    ).toBe(false) // no colon
    expect(isAdminAuthorized(null)).toBe(false)
  })

  it("fails closed when CRON_SECRET is unset", async () => {
    const { isAdminAuthorized } = await loadAuth(undefined)
    expect(isAdminAuthorized(basic("admin", ""))).toBe(false)
    expect(isAdminAuthorized("Bearer ")).toBe(false)
  })
})
