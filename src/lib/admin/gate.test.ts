import { beforeEach, describe, expect, it, vi } from "vitest"

import { checkAdminLogin, type AdminLoginDeps } from "./gate"
import { LOCKOUT_MS, memoryLockoutStore, type LockoutStore } from "./lockout"

const RIGHT = "Basic right"
const WRONG = "Basic wrong"
const T0 = new Date("2026-10-20T12:00:00Z")

let store: LockoutStore
let logs: string[]

beforeEach(() => {
  store = memoryLockoutStore()
  logs = []
})

const deps = (
  ip: string,
  now = T0,
  overrides: Partial<AdminLoginDeps> = {}
): AdminLoginDeps => ({
  authorize: (h) => h === RIGHT,
  store: async () => store,
  ip,
  now,
  log: (m) => logs.push(m),
  ...overrides,
})

describe("checkAdminLogin", () => {
  it("asks for a login without counting a failure", async () => {
    const getStore = vi.fn(async () => store)
    const response = await checkAdminLogin(
      null,
      deps("203.0.113.7", T0, { store: getStore })
    )
    expect(response?.status).toBe(401)
    expect(response?.headers.get("www-authenticate")).toMatch(/^Basic realm=/)
    expect(response?.headers.get("x-robots-tag")).toBe("noindex, nofollow")
    expect(response?.headers.get("cache-control")).toBe("no-store")
    expect(getStore).not.toHaveBeenCalled()
  })

  it("lets the right login through", async () => {
    expect(await checkAdminLogin(RIGHT, deps("203.0.113.7"))).toBeNull()
  })

  it("logs each failure and locks out on the fifth", async () => {
    for (let i = 1; i <= 4; i++) {
      const response = await checkAdminLogin(WRONG, deps("203.0.113.7"))
      expect(response?.status).toBe(401)
    }
    const fifth = await checkAdminLogin(WRONG, deps("203.0.113.7"))
    expect(fifth?.status).toBe(429)
    expect(fifth?.headers.get("retry-after")).toBe(String(LOCKOUT_MS / 1000))
    expect(await fifth?.text()).toBe(
      "Too many failed sign-ins. Try again in 15 minutes."
    )
    expect(logs).toEqual([
      "[admin] failed sign-in from 203.0.113.7 (1 of 5)",
      "[admin] failed sign-in from 203.0.113.7 (2 of 5)",
      "[admin] failed sign-in from 203.0.113.7 (3 of 5)",
      "[admin] failed sign-in from 203.0.113.7 (4 of 5)",
      "[admin] failed sign-in from 203.0.113.7 (5 of 5)",
      "[admin] 203.0.113.7 locked out until 2026-10-20T12:15:00.000Z after 5 failed sign-ins",
    ])
    // Never the credentials themselves.
    expect(logs.join("\n")).not.toContain("wrong")
  })

  it("refuses even the right login during a lockout, then lets it in", async () => {
    for (let i = 0; i < 5; i++)
      await checkAdminLogin(WRONG, deps("203.0.113.7"))
    const during = new Date(T0.getTime() + LOCKOUT_MS - 60_000)
    const blocked = await checkAdminLogin(RIGHT, deps("203.0.113.7", during))
    expect(blocked?.status).toBe(429)
    expect(await blocked?.text()).toContain("1 minute.")
    // Another address is unaffected.
    expect(
      await checkAdminLogin(RIGHT, deps("198.51.100.1", during))
    ).toBeNull()

    const after = new Date(T0.getTime() + LOCKOUT_MS)
    expect(await checkAdminLogin(RIGHT, deps("203.0.113.7", after))).toBeNull()
    expect(await store.get("203.0.113.7")).toBeNull() // cleared
  })

  it("locks a whole IPv6 /64, so changing address doesn't help", async () => {
    for (let i = 1; i <= 5; i++) {
      await checkAdminLogin(WRONG, deps(`2001:db8:aa:bb::${i}`))
    }
    const response = await checkAdminLogin(RIGHT, deps("2001:db8:aa:bb::99"))
    expect(response?.status).toBe(429)
    expect(logs.at(-1)).toContain("[admin] 2001:db8:aa:bb::/64 locked out")
  })

  it("a successful login resets the count", async () => {
    for (let i = 0; i < 4; i++)
      await checkAdminLogin(WRONG, deps("203.0.113.7"))
    expect(await checkAdminLogin(RIGHT, deps("203.0.113.7"))).toBeNull()
    expect((await checkAdminLogin(WRONG, deps("203.0.113.7")))?.status).toBe(
      401
    )
    expect(logs.at(-1)).toContain("(1 of 5)")
  })

  it("fails closed when the lockout store is down", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const broken = deps("203.0.113.7", T0, {
      store: async () => {
        throw new Error("connection refused")
      },
    })
    expect((await checkAdminLogin(RIGHT, broken))?.status).toBe(503)
    expect(error).toHaveBeenCalledWith("[admin] lockout store failed: Error")
    error.mockRestore()
  })
})
