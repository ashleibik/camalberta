import { describe, expect, it } from "vitest"

import { autoLabel, TOO_DARK_BELOW, WASHED_OUT_ABOVE } from "./labels"

const condition = (
  primary: string,
  secondary: string[] = [],
  visibility: string | null = "Good"
) => ({ primary, secondary, visibility })

describe("autoLabel", () => {
  it("maps the bare conditions", () => {
    expect(
      autoLabel({ brightness: 120, condition: condition("Bare Dry") }).label
    ).toBe("dry")
    expect(
      autoLabel({ brightness: 120, condition: condition("Bare Wet") }).label
    ).toBe("wet")
  })

  it("maps the winter conditions by keyword, with ice folded in", () => {
    for (const [primary, label] of [
      ["Partly Covered Snow", "partly_snow"],
      ["Partly Covered Ice", "partly_snow"],
      ["Snow Covered", "snow_covered"],
      ["Covered Snow", "snow_covered"],
      ["Ice Covered", "snow_covered"],
      ["Snow Packed", "snow_covered"],
    ] as const) {
      expect(
        autoLabel({ brightness: 120, condition: condition(primary) }).label
      ).toBe(label)
    }
  })

  it("turns bare roads with Bare Wheel Paths into partly snow", () => {
    const result = autoLabel({
      brightness: 120,
      condition: condition("Bare Wet", ["Bare Wheel Paths"]),
    })
    expect(result.label).toBe("partly_snow")
    expect(result.reason).toContain("Bare Wheel Paths")
  })

  it("gives no label when 511 doesn't describe the surface", () => {
    for (const primary of ["Closed", "No Report", "Travel Not Recommended"]) {
      const result = autoLabel({
        brightness: 120,
        condition: condition(primary),
      })
      expect(result.label).toBeNull()
      expect(result.reason).toContain(primary)
    }
  })

  it("gives no label when no condition is near the camera", () => {
    expect(autoLabel({ brightness: 120, condition: null })).toEqual({
      label: null,
      reason: "No 511 road condition near this camera",
    })
  })

  it("says can't see for dark and washed out photos, before anything else", () => {
    expect(
      autoLabel({
        brightness: TOO_DARK_BELOW - 1,
        condition: condition("Bare Dry"),
      }).label
    ).toBe("cant_see")
    expect(
      autoLabel({ brightness: WASHED_OUT_ABOVE + 1, condition: null }).label
    ).toBe("cant_see")
    // Infrared night views (measured 74 to 98) keep 511's label.
    expect(
      autoLabel({ brightness: 80, condition: condition("Bare Dry") }).label
    ).toBe("dry")
  })

  it("says can't see when 511 reports poor visibility", () => {
    expect(
      autoLabel({
        brightness: 120,
        condition: condition("Bare Dry", [], "Poor"),
      }).label
    ).toBe("cant_see")
  })
})
