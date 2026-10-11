import { describe, expect, it } from "vitest"

import type { Camera } from "@/lib/db/schema"

import { toFeature, toPublicCamera } from "./serialize"

const row: Camera = {
  id: "calgary:loc65",
  source: "calgary",
  sourceId: "loc65",
  name: "16 Avenue / Edmonton Trail NE",
  road: "16 Avenue / Edmonton Trail NE",
  direction: null,
  quadrant: "NE",
  area: "calgary",
  lat: 51.0668211,
  lng: -114.0562102,
  imageUrl: "http://trafficcam.calgary.ca/loc65.jpg",
  status: "live",
  lastSeenAt: new Date("2026-10-11T21:20:45.173Z"),
  updatedAt: new Date("2026-10-11T21:20:45.173Z"),
}

describe("toPublicCamera", () => {
  it("never exposes the upstream image URL", () => {
    const pub = toPublicCamera(row)
    expect("imageUrl" in pub).toBe(false)
    expect(JSON.stringify(pub)).not.toContain("trafficcam.calgary.ca")
  })

  it("serializes timestamps as ISO strings", () => {
    const pub = toPublicCamera(row)
    expect(pub.lastSeenAt).toBe("2026-10-11T21:20:45.173Z")
    expect(pub.updatedAt).toBe("2026-10-11T21:20:45.173Z")
  })

  it("carries the display fields", () => {
    const pub = toPublicCamera(row)
    expect(pub.quadrant).toBe("NE")
    expect(pub.area).toBe("calgary")
    expect(pub.status).toBe("live")
  })
})

describe("toFeature", () => {
  it("produces a GeoJSON point in [lng, lat] order", () => {
    const feature = toFeature(row)
    expect(feature.type).toBe("Feature")
    expect(feature.geometry).toEqual({
      type: "Point",
      coordinates: [-114.0562102, 51.0668211],
    })
  })

  it("keeps the image URL out of properties", () => {
    const feature = toFeature(row)
    expect(JSON.stringify(feature.properties)).not.toContain("trafficcam")
    expect(feature.properties.id).toBe("calgary:loc65")
    expect(feature.properties.status).toBe("live")
  })
})
