import { fileURLToPath } from "node:url"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import type { Database } from "@/lib/db"
import * as schema from "@/lib/db/schema"

import {
  isLocked,
  LOCKOUT_MS,
  lockoutKey,
  MAX_FAILURES,
  memoryLockoutStore,
  WINDOW_MS,
  type LockoutStore,
} from "./lockout"
import { dbLockoutStore } from "./lockout-db"

describe("lockoutKey", () => {
  it("keeps IPv4 addresses whole", () => {
    expect(lockoutKey("203.0.113.7")).toBe("203.0.113.7")
    expect(lockoutKey(" 203.0.113.7 ")).toBe("203.0.113.7")
    expect(lockoutKey("::ffff:203.0.113.7")).toBe("203.0.113.7")
  })

  it("groups IPv6 addresses by /64", () => {
    const key = "2001:db8:aa:bb::/64"
    expect(lockoutKey("2001:db8:aa:bb::1")).toBe(key)
    expect(lockoutKey("2001:0db8:00aa:00bb:1234:5678:9abc:def0")).toBe(key)
    expect(lockoutKey("[2001:DB8:AA:BB:ffff::]")).toBe(key)
    expect(lockoutKey("2001:db8:aa:bb::1%eth0")).toBe(key)
    expect(lockoutKey("::1")).toBe("0:0:0:0::/64")
    expect(lockoutKey("2001:db8:aa:cc::1")).not.toBe(key)
  })

  it("passes anything else through, capped", () => {
    expect(lockoutKey("unknown")).toBe("unknown")
    expect(lockoutKey("")).toBe("unknown")
    expect(lockoutKey("1:2:3")).toBe("1:2:3") // not a valid IPv6
    expect(lockoutKey("x".repeat(500))).toHaveLength(64)
  })
})

// Both stores must behave the same: memory (development) and Postgres
// (production, here on PGlite with the real migrations).
let client: PGlite
let db: Database

beforeAll(async () => {
  client = new PGlite()
  const pglite = drizzle({ client, schema })
  await migrate(pglite, {
    migrationsFolder: fileURLToPath(
      new URL("../../../drizzle", import.meta.url)
    ),
  })
  db = pglite
}, 30_000)

afterAll(async () => {
  await client.close()
})

describe.each([
  ["memory", () => memoryLockoutStore()],
  ["postgres", () => dbLockoutStore(db)],
])("%s lockout store", (_name, makeStore: () => LockoutStore) => {
  let store: LockoutStore
  const T0 = new Date("2026-10-20T12:00:00Z")
  const at = (ms: number) => new Date(T0.getTime() + ms)

  beforeEach(async () => {
    await db.delete(schema.adminLoginFailures)
    store = makeStore()
  })

  it("locks on the fifth failure within the window, for 15 minutes", async () => {
    for (let i = 1; i < MAX_FAILURES; i++) {
      const state = await store.recordFailure("203.0.113.7", at(i * 1000))
      expect(state.failures).toBe(i)
      expect(isLocked(state, at(i * 1000))).toBe(false)
    }
    const fifth = await store.recordFailure("203.0.113.7", at(5000))
    expect(fifth.failures).toBe(MAX_FAILURES)
    expect(fifth.lockedUntil).toEqual(at(5000 + LOCKOUT_MS))

    const state = await store.get("203.0.113.7")
    expect(isLocked(state, at(5000 + LOCKOUT_MS - 1))).toBe(true)
    expect(isLocked(state, at(5000 + LOCKOUT_MS))).toBe(false)
    // Other addresses are unaffected.
    expect(await store.get("198.51.100.1")).toBeNull()
  })

  it("starts counting again once the window has passed", async () => {
    for (let i = 0; i < MAX_FAILURES - 1; i++) {
      await store.recordFailure("203.0.113.7", at(i))
    }
    const later = await store.recordFailure("203.0.113.7", at(WINDOW_MS + 1))
    expect(later).toEqual({ failures: 1, lockedUntil: null })
  })

  it("after a lockout ends, the next failure starts a new count", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) {
      await store.recordFailure("203.0.113.7", at(i))
    }
    const after = await store.recordFailure(
      "203.0.113.7",
      at(MAX_FAILURES + LOCKOUT_MS)
    )
    expect(after.failures).toBe(1)
    expect(isLocked(after, at(MAX_FAILURES + LOCKOUT_MS))).toBe(false)
  })

  it("clear forgets an address", async () => {
    await store.recordFailure("203.0.113.7", T0)
    await store.clear("203.0.113.7")
    expect(await store.get("203.0.113.7")).toBeNull()
  })

  it("counts concurrent failures exactly", async () => {
    const states = await Promise.all(
      Array.from({ length: MAX_FAILURES }, () =>
        store.recordFailure("203.0.113.7", T0)
      )
    )
    expect(states.map((s) => s.failures).sort()).toEqual([1, 2, 3, 4, 5])
    expect(isLocked(await store.get("203.0.113.7"), T0)).toBe(true)
  })
})

describe("postgres lockout store", () => {
  it("prunes records unused for a day", async () => {
    await db.delete(schema.adminLoginFailures)
    const store = dbLockoutStore(db)
    const T0 = new Date("2026-10-20T12:00:00Z")
    await store.recordFailure("203.0.113.7", T0)
    await store.recordFailure(
      "198.51.100.1",
      new Date(T0.getTime() + 25 * 60 * 60_000)
    )
    expect(await store.get("203.0.113.7")).toBeNull()
    expect(await store.get("198.51.100.1")).not.toBeNull()
  })
})
