import { describe, expect, it } from "vitest"

import alberta511Fixture from "./__fixtures__/alberta511.json"
import { alberta511ResponseSchema, normalizeAlberta511 } from "./alberta511"

const records = alberta511ResponseSchema.parse(alberta511Fixture)

describe("alberta511 adapter", () => {
  const cameras = normalizeAlberta511(records)

  it("parses the documented sample shape", () => {
    expect(records.length).toBeGreaterThan(0)
  })

  it("keeps only cameras inside the covered areas", () => {
    // The Red Deer record (id 950) is outside every box.
    expect(cameras.some((c) => c.name.includes("Red Deer"))).toBe(false)
    for (const camera of cameras) {
      expect(["calgary", "bow_valley", "edmonton"]).toContain(camera.area)
    }
  })

  it("classifies an Edmonton highway camera as edmonton", () => {
    const whitemud = cameras.find((c) => c.sourceId === "900-900")
    expect(whitemud?.area).toBe("edmonton")
  })

  it("classifies a Calgary-area highway camera as calgary", () => {
    const hwy22 = cameras.find((c) => c.sourceId === "330-330")
    expect(hwy22?.area).toBe("calgary")
  })

  it("classifies a Banff camera as bow_valley", () => {
    const banff = cameras.find((c) => c.sourceId === "11-11")
    expect(banff?.area).toBe("bow_valley")
  })

  it("emits one camera per enabled view", () => {
    // Camera 204 has two enabled views (204, 205) -> two cameras, both keyed
    // by the record id.
    expect(cameras.filter((c) => c.sourceId.startsWith("204-")).length).toBe(2)
    expect(cameras.some((c) => c.sourceId === "204-204")).toBe(true)
    expect(cameras.some((c) => c.sourceId === "204-205")).toBe(true)
  })

  it("skips disabled views", () => {
    // Camera 512 has one enabled (512) and one disabled (513) view.
    expect(cameras.some((c) => c.sourceId === "512-512")).toBe(true)
    expect(cameras.some((c) => c.sourceId === "512-513")).toBe(false)
  })

  it("normalizes 'Unknown' direction to null", () => {
    const lakeLouise = cameras.find((c) => c.sourceId === "512-512")
    expect(lakeLouise?.direction).toBeNull()
  })

  it("uses our own id scheme and the 511 image host", () => {
    for (const camera of cameras) {
      expect(camera.source).toBe("alberta511")
      expect(camera.id).toBe(`alberta511:${camera.sourceId}`)
      expect(camera.imageUrl).toContain("511.alberta.ca")
    }
  })
})
