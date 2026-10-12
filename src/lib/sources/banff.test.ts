import { describe, expect, it } from "vitest"

import { BANFF_CAMERAS, banffSourceId, normalizeBanff } from "./banff"
import { normalizeSunshine, SUNSHINE_CAMERAS } from "./sunshine"

describe("banff adapter", () => {
  const cameras = normalizeBanff()

  it("keeps every camera from the Town's page", () => {
    expect(cameras).toHaveLength(BANFF_CAMERAS.length)
    expect(cameras.length).toBe(17)
  })

  it("places every camera in the Bow Valley on the Town's image host", () => {
    for (const camera of cameras) {
      expect(camera.area).toBe("bow_valley")
      expect(camera.id).toBe(`banff:${camera.sourceId}`)
      expect(camera.imageUrl).toMatch(
        /^https:\/\/ftp\.banff\.ca\/images\/[A-Za-z0-9_.-]+\.jpg$/
      )
      // Downtown Banff and its edges (Rimrock Hotel to the Fenlands).
      expect(camera.lat).toBeGreaterThan(51.14)
      expect(camera.lat).toBeLessThan(51.19)
    }
  })

  it("turns image file names into ids that fit our id format", () => {
    expect(banffSourceId("Banff_Ave_Buffalo.jpg")).toBe("banff-ave-buffalo")
    expect(banffSourceId("spray-west-01.jpg")).toBe("spray-west-01")
    for (const camera of cameras) {
      expect(camera.sourceId).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it("has unique ids and no two markers on the exact same spot", () => {
    expect(new Set(cameras.map((c) => c.id)).size).toBe(cameras.length)
    const spots = new Set(cameras.map((c) => `${c.lat},${c.lng}`))
    expect(spots.size).toBe(cameras.length)
  })

  it("skips a file name that isn't a plain jpeg", () => {
    const [first] = BANFF_CAMERAS
    expect(
      normalizeBanff([{ ...first!, file: "../../secret.jpg" }])
    ).toHaveLength(0)
  })
})

describe("sunshine adapter", () => {
  const cameras = normalizeSunshine()

  it("keeps the resort's four webcams in the Bow Valley", () => {
    expect(cameras).toHaveLength(SUNSHINE_CAMERAS.length)
    expect(cameras).toHaveLength(4)
    for (const camera of cameras) {
      expect(camera.area).toBe("bow_valley")
      expect(camera.id).toBe(`sunshine:${camera.sourceId}`)
      expect(camera.imageUrl).toMatch(
        /^https:\/\/cameras\.skibanff\.com\/dynamic\/[a-z0-9]+$/
      )
    }
  })
})
