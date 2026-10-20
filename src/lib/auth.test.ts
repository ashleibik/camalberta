import { afterEach, describe, expect, it, vi } from "vitest"

import { hashPassword } from "./admin/password"

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
  const USER = "labeller"
  const PASSWORD = "correct-horse-battery-staple"
  const basic = (user: string, pass: string) =>
    `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`

  async function loadAdmin(user?: string, password?: string) {
    vi.resetModules()
    vi.stubEnv("CRON_SECRET", SECRET)
    vi.stubEnv("ADMIN_USERNAME", user ?? "")
    // Only the scrypt hash is ever in the environment.
    vi.stubEnv(
      "ADMIN_PASSWORD_HASH",
      password ? await hashPassword(password) : ""
    )
    return import("./auth")
  }

  it("accepts the admin username and password", async () => {
    const { isAdminAuthorized } = await loadAdmin(USER, PASSWORD)
    expect(await isAdminAuthorized(basic(USER, PASSWORD))).toBe(true)
    // The scheme name is case-insensitive.
    expect(
      await isAdminAuthorized(basic(USER, PASSWORD).replace("Basic", "basic"))
    ).toBe(true)
  })

  it("needs both parts right: any user name is no longer enough", async () => {
    const { isAdminAuthorized } = await loadAdmin(USER, PASSWORD)
    expect(await isAdminAuthorized(basic("admin", PASSWORD))).toBe(false)
    expect(await isAdminAuthorized(basic("", PASSWORD))).toBe(false)
    expect(await isAdminAuthorized(basic(USER, `${PASSWORD}x`))).toBe(false)
    expect(await isAdminAuthorized(basic(USER.toUpperCase(), PASSWORD))).toBe(
      false
    )
  })

  it("no longer accepts CRON_SECRET in any form", async () => {
    const { isAdminAuthorized } = await loadAdmin(USER, PASSWORD)
    expect(await isAdminAuthorized(`Bearer ${SECRET}`)).toBe(false)
    expect(await isAdminAuthorized(basic(USER, SECRET))).toBe(false)
    expect(await isAdminAuthorized(basic("admin", SECRET))).toBe(false)
  })

  it("rejects malformed headers and no header", async () => {
    const { isAdminAuthorized } = await loadAdmin(USER, PASSWORD)
    expect(await isAdminAuthorized("Basic not base64!")).toBe(false)
    expect(
      await isAdminAuthorized(
        `Basic ${Buffer.from(PASSWORD).toString("base64")}`
      )
    ).toBe(false) // no colon
    expect(await isAdminAuthorized(null)).toBe(false)
  })

  it("fails closed when the username or password is unset", async () => {
    let auth = await loadAdmin(USER, undefined)
    expect(await auth.isAdminAuthorized(basic(USER, ""))).toBe(false)
    auth = await loadAdmin(undefined, PASSWORD)
    expect(await auth.isAdminAuthorized(basic("", PASSWORD))).toBe(false)
  })
})

describe("adminEnabled", () => {
  it("is off in production unless ADMIN_ENABLED is true", async () => {
    const { adminEnabled } = await loadAuth(SECRET)
    const prod = (flag?: string) =>
      adminEnabled({ nodeEnv: "production", flag, configured: true })
    expect(prod(undefined)).toBe(false)
    expect(prod("false")).toBe(false)
    expect(prod("1")).toBe(false)
    expect(prod("yes")).toBe(false)
    expect(prod("true")).toBe(true)
    expect(prod(" TRUE ")).toBe(true)
  })

  it("is on in development unless ADMIN_ENABLED is false", async () => {
    const { adminEnabled } = await loadAuth(SECRET)
    const dev = (flag?: string) =>
      adminEnabled({ nodeEnv: "development", flag, configured: true })
    expect(dev(undefined)).toBe(true)
    expect(dev("false")).toBe(false)
  })

  it("is always off without a configured login", async () => {
    const { adminEnabled } = await loadAuth(SECRET)
    expect(
      adminEnabled({ nodeEnv: "production", flag: "true", configured: false })
    ).toBe(false)
    expect(
      adminEnabled({
        nodeEnv: "development",
        flag: undefined,
        configured: false,
      })
    ).toBe(false)
  })
})
