import { describe, expect, it } from "vitest"

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

  it("returns null outside both boxes", () => {
    expect(classifyArea(53.5461, -113.4938)).toBeNull() // Edmonton
    expect(classifyArea(43.6532, -79.3832)).toBeNull() // Toronto
  })

  it("is exclusive at the boundary edges", () => {
    // Just outside Calgary's eastern edge.
    expect(classifyArea(51.0, -113.84)).toBeNull()
  })
})
