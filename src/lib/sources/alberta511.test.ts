import { describe, expect, it } from "vitest"

import alberta511Fixture from "./__fixtures__/alberta511.json"
import { alberta511ResponseSchema, normalizeAlberta511 } from "./alberta511"

// A real response from https://511.alberta.ca/api/v2/get/cameras, saved
// 2026-10-19 (380 cameras province-wide).
const records = alberta511ResponseSchema.parse(alberta511Fixture)

describe("alberta511 adapter", () => {
  const cameras = normalizeAlberta511(records)
  const byRecord = (id: number) =>
    cameras.filter((c) => c.sourceId.startsWith(`${id}-`))

  it("parses every camera in the saved real response", () => {
    expect(records).toHaveLength(380)
  })

  it("keeps only cameras in a covered area", () => {
    for (const camera of cameras) {
      expect(["calgary", "bow_valley", "qe2", "edmonton"]).toContain(
        camera.area
      )
    }
    // Swan Hills (Hwy 32), far from everything we cover.
    expect(byRecord(318)).toHaveLength(0)
  })

  it("keeps QEII cameras between Calgary and Edmonton as the qe2 area", () => {
    // "Hwy 2: North of Balzac Overpass south of Airdrie"
    const balzac = byRecord(77)
    expect(balzac.length).toBeGreaterThan(0)
    for (const camera of balzac) expect(camera.area).toBe("qe2")
    // "Hwy 2: South of Hwy 2A overpass near Leduc"
    expect(byRecord(83)[0]?.area).toBe("qe2")
  })

  it("keeps Highway 1 cameras between Calgary and the mountains", () => {
    // "Hwy 1: West of Hwy 22 Overpass" and "Hwy 1: East of Dead Mans Flat
    // Overpass" were outside the brief's original Bow Valley box.
    expect(byRecord(64)[0]?.area).toBe("bow_valley")
    expect(byRecord(63)[0]?.area).toBe("bow_valley")
  })

  it("classifies city and mountain cameras by their box", () => {
    expect(byRecord(1)[0]?.area).toBe("calgary") // Stoney Trail - Nose Hill Dr
    expect(byRecord(282)[0]?.area).toBe("bow_valley") // TCH Sunshine Overpass
    expect(byRecord(295)[0]?.area).toBe("edmonton") // Henday and 91 Street
  })

  it("emits one camera per enabled view", () => {
    // Record 64 has four enabled views.
    expect(
      byRecord(64)
        .map((c) => c.sourceId)
        .sort()
    ).toEqual(["64-142", "64-143", "64-144", "64-145"])
  })

  it("skips disabled views", () => {
    // "Hwy 2: North of Hwy 11A Red Deer": all four views are Disabled.
    expect(byRecord(81)).toHaveLength(0)
  })

  it("does not append 'N/A' view names or store 'N/A' as a road", () => {
    // Record 3 "8 Ave / 12 Street SE" has a view described "N/A".
    expect(byRecord(3)[0]?.name).toBe("8 Ave / 12 Street SE")
    // Record 425 (a QEII weather station camera) has Roadway "N/A".
    expect(byRecord(425)[0]?.road).toBeNull()
    for (const camera of cameras) {
      expect(camera.name).not.toMatch(/N\/A/)
      expect(camera.road).not.toBe("N/A")
    }
  })

  it("normalizes 'Unknown' direction to null", () => {
    // Record 1's Direction is "Unknown".
    expect(byRecord(1)[0]?.direction).toBeNull()
  })

  it("uses our own id scheme and the 511 image host", () => {
    for (const camera of cameras) {
      expect(camera.source).toBe("alberta511")
      expect(camera.id).toBe(`alberta511:${camera.sourceId}`)
      expect(new URL(camera.imageUrl).hostname).toBe("511.alberta.ca")
    }
  })
})
