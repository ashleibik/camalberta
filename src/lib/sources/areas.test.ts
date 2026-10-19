import { describe, expect, it } from "vitest"

import { classifyCameraArea } from "@/lib/trip/corridors"

import { classifyArea } from "./areas"

describe("classifyArea", () => {
  it("places downtown Calgary in calgary", () => {
    expect(classifyArea(51.0447, -114.0719)).toBe("calgary")
  })

  it("places Banff in bow_valley", () => {
    expect(classifyArea(51.1784, -115.5708)).toBe("bow_valley")
  })

  it("places Lake Louise in bow_valley", () => {
    expect(classifyArea(51.4254, -116.1773)).toBe("bow_valley")
  })

  it("places Sunshine Village in bow_valley", () => {
    expect(classifyArea(51.0712, -115.7865)).toBe("bow_valley")
  })

  it("places Highway 1 between Calgary and Canmore in bow_valley", () => {
    expect(classifyArea(51.0873, -114.492)).toBe("bow_valley") // Hwy 22 junction
    expect(classifyArea(51.0405, -115.246)).toBe("bow_valley") // Dead Man's Flats
  })

  it("places downtown Edmonton in edmonton", () => {
    expect(classifyArea(53.5461, -113.4938)).toBe("edmonton")
  })

  it("returns null outside every box", () => {
    expect(classifyArea(52.2681, -113.8112)).toBeNull() // Red Deer
    expect(classifyArea(43.6532, -79.3832)).toBeNull() // Toronto
  })

  it("is exclusive at the boundary edges", () => {
    // Just outside Calgary's eastern edge.
    expect(classifyArea(51.0, -113.84)).toBeNull()
  })
})

describe("classifyCameraArea", () => {
  it("adds the QEII corridor between the Calgary and Edmonton boxes", () => {
    // A camera on Highway 2 near Ponoka (511 record 423, ~15 m off the line).
    expect(classifyCameraArea(52.677, -113.651)).toBe("qe2")
  })

  it("does not claim cameras a few km off the QEII", () => {
    // Downtown Red Deer, ~4 km east of the highway.
    expect(classifyCameraArea(52.2681, -113.8112)).toBeNull()
    // Sylvan Lake, on Highway 11 west of Red Deer.
    expect(classifyCameraArea(52.3083, -114.0964)).toBeNull()
  })

  it("prefers the box areas", () => {
    expect(classifyCameraArea(51.0447, -114.0719)).toBe("calgary")
    expect(classifyCameraArea(53.5461, -113.4938)).toBe("edmonton")
  })
})
