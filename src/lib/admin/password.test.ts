import { describe, expect, it } from "vitest"

import {
  constantTimeEqual,
  hashPassword,
  isScryptHash,
  parseScryptHash,
  verifyPassword,
} from "./password"

describe("scrypt admin password", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery staple")
    expect(hash).toMatch(
      /^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/
    )
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(
      true
    )
    expect(await verifyPassword("correct horse battery stapl", hash)).toBe(
      false
    )
    expect(await verifyPassword("", hash)).toBe(false)
  })

  it("uses a fresh 16-byte salt for every hash", async () => {
    const a = await hashPassword("same password here")
    const b = await hashPassword("same password here")
    expect(a).not.toBe(b)
    expect(parseScryptHash(a)!.salt).toHaveLength(16)
    expect(parseScryptHash(a)!.hash).toHaveLength(32)
  })

  it("rejects malformed hashes and unsafe parameters", async () => {
    const hash = await hashPassword("correct horse battery staple")
    const [, , , , salt, key] = hash.split("$")
    for (const bad of [
      "",
      "plain-password",
      `scrypt$1024$8$1$${salt}$${key}`, // N too small
      `scrypt$30000$8$1$${salt}$${key}`, // N not a power of two
      `scrypt$32768$0$1$${salt}$${key}`, // r out of range
      `bcrypt$32768$8$1$${salt}$${key}`,
    ]) {
      expect(isScryptHash(bad), bad).toBe(false)
      expect(await verifyPassword("correct horse battery staple", bad)).toBe(
        false
      )
    }
  })
})

describe("constantTimeEqual", () => {
  it("matches only identical strings", () => {
    expect(constantTimeEqual("labeller", "labeller")).toBe(true)
    expect(constantTimeEqual("labeller", "labelle")).toBe(false)
    expect(constantTimeEqual("labeller", "Labeller")).toBe(false)
    expect(constantTimeEqual("", "")).toBe(true)
    expect(constantTimeEqual("a", "")).toBe(false)
  })

  it("never matches values longer than its buffer", () => {
    const long = "x".repeat(600)
    expect(constantTimeEqual(long, long)).toBe(false)
    expect(
      constantTimeEqual(long.slice(0, 512) + "y", long.slice(0, 512) + "z")
    ).toBe(false)
  })
})
