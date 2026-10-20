import { describe, expect, it } from "vitest"

import {
  MAX_TILES,
  parseWallParams,
  wallFromCookie,
  wallToSearch,
} from "./wall"

describe("parseWallParams", () => {
  it("returns null when the URL carries no wall", () => {
    expect(parseWallParams("")).toBeNull()
    expect(parseWallParams("?cam=calgary:loc65")).toBeNull()
  })

  it("reads a grid size and camera ids", () => {
    expect(parseWallParams("?grid=3&cams=calgary:loc65,banff:wolf-st")).toEqual(
      {
        grid: 3,
        cams: ["calgary:loc65", "banff:wolf-st"],
      }
    )
  })

  it("falls back to a 2x2 grid for anything that isn't 1 to 4", () => {
    for (const grid of ["7", "0", "2.5", "abc", ""]) {
      expect(parseWallParams(`?grid=${grid}&cams=`)?.grid, grid).toBe(2)
    }
  })

  it("drops malformed camera ids and caps the count", () => {
    const many = Array.from({ length: 20 }, (_, i) => `calgary:loc${i}`)
    const wall = parseWallParams(
      `?cams=${["https://evil.example", ...many, "x"].join(",")}`
    )
    expect(wall?.cams).toHaveLength(MAX_TILES)
    expect(wall?.cams[0]).toBe("calgary:loc0")
  })

  it("round-trips through wallToSearch", () => {
    const wall = { grid: 4 as const, cams: ["edmonton:12", "calgary:loc1"] }
    expect(parseWallParams(`?${wallToSearch(wall)}`)).toEqual(wall)
  })
})

describe("wallFromCookie", () => {
  it("reads the wall saved by saveWall", () => {
    const wall = { grid: 3 as const, cams: ["calgary:loc65"] }
    expect(wallFromCookie(encodeURIComponent(wallToSearch(wall)))).toEqual(wall)
  })

  it("treats a missing, oversized or malformed cookie as no wall", () => {
    expect(wallFromCookie(undefined)).toBeNull()
    expect(wallFromCookie("")).toBeNull()
    expect(wallFromCookie("x".repeat(5000))).toBeNull()
    expect(wallFromCookie("%E0%A4%A")).toBeNull() // broken percent-encoding
    expect(wallFromCookie("nothing-useful")).toBeNull()
  })

  it("drops anything that isn't a valid camera id", () => {
    const value = encodeURIComponent("grid=2&cams=<script>,calgary:loc1")
    expect(wallFromCookie(value)?.cams).toEqual(["calgary:loc1"])
  })
})
