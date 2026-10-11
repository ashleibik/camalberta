import { describe, expect, it } from "vitest"

import calgaryFixture from "./__fixtures__/calgary.json"
import {
  calgaryResponseSchema,
  normalizeCalgary,
  type CalgaryCamera,
} from "./calgary"

const records = calgaryResponseSchema.parse(calgaryFixture)

describe("calgary adapter", () => {
  it("parses the saved real response", () => {
    expect(records.length).toBeGreaterThan(100)
  })

  it("normalizes every real record into a Calgary camera", () => {
    const cameras = normalizeCalgary(records)
    expect(cameras.length).toBeGreaterThan(100)
    for (const camera of cameras) {
      expect(camera.source).toBe("calgary")
      expect(camera.id).toBe(`calgary:${camera.sourceId}`)
      expect(camera.area).toBe("calgary")
      expect(camera.imageUrl).toContain("trafficcam.calgary.ca")
      expect(camera.lat).toBeGreaterThan(50.8)
      expect(camera.lat).toBeLessThan(51.3)
    }
  })

  it("derives a stable sourceId from the image URL", () => {
    const sample: CalgaryCamera = {
      camera_url: {
        url: "http://trafficcam.calgary.ca/loc65.jpg",
        description: "Camera 66",
      },
      camera_location: "16 Avenue / Edmonton Trail NE",
      quadrant: "NE",
      point: { type: "Point", coordinates: [-114.0562102, 51.0668211] },
    }
    const [camera] = normalizeCalgary([sample])
    expect(camera).toBeDefined()
    expect(camera!.sourceId).toBe("loc65")
    expect(camera!.quadrant).toBe("NE")
    expect(camera!.lng).toBe(-114.0562102)
    expect(camera!.lat).toBe(51.0668211)
  })

  it("rejects a camera whose image host is not trafficcam.calgary.ca", () => {
    const evil: CalgaryCamera = {
      camera_url: { url: "http://evil.example.com/loc1.jpg" },
      camera_location: "Nowhere",
      quadrant: "NE",
      point: { type: "Point", coordinates: [-114.06, 51.05] },
    }
    expect(normalizeCalgary([evil])).toHaveLength(0)
  })

  it("drops a camera outside the covered bounding boxes", () => {
    const toronto: CalgaryCamera = {
      camera_url: { url: "http://trafficcam.calgary.ca/loc999.jpg" },
      camera_location: "Toronto",
      quadrant: "NE",
      point: { type: "Point", coordinates: [-79.38, 43.65] },
    }
    expect(normalizeCalgary([toronto])).toHaveLength(0)
  })

  it("skips records with no point", () => {
    const noPoint = {
      camera_url: { url: "http://trafficcam.calgary.ca/loc5.jpg" },
      camera_location: "Unknown",
      quadrant: "NE",
    }
    const parsed = calgaryResponseSchema.parse([noPoint])
    expect(normalizeCalgary(parsed)).toHaveLength(0)
  })

  it("de-duplicates repeated source ids", () => {
    const dup: CalgaryCamera = {
      camera_url: { url: "http://trafficcam.calgary.ca/loc5.jpg" },
      camera_location: "A",
      quadrant: "NE",
      point: { type: "Point", coordinates: [-114.06, 51.05] },
    }
    expect(normalizeCalgary([dup, dup])).toHaveLength(1)
  })
})
