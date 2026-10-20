import { describe, expect, it } from "vitest"

import { isCameraId } from "./camera-id"
import { cameraIdSchema } from "./camera-id-schema"
import { tripIdSchema } from "./trip/trip-schema"
import { isTripId, parseTripParam } from "./trip/trips"

const CAMERA_CASES: Array<[unknown, boolean]> = [
  ["calgary:loc65", true],
  ["alberta511:204-205", true],
  ["banff:wolf-st", true],
  ["https://evil.example/x.jpg", false],
  ["calgary:LOC65", false],
  ["calgary", false],
  [":loc65", false],
  ["calgary:loc65\n", false],
  [`calgary:${"a".repeat(130)}`, false],
  [42, false],
  [null, false],
]

describe("camera ids", () => {
  it("the browser guard and the server schema agree", () => {
    for (const [value, valid] of CAMERA_CASES) {
      expect(isCameraId(value), String(value)).toBe(valid)
      expect(cameraIdSchema.safeParse(value).success, String(value)).toBe(valid)
    }
  })
})

describe("trip ids", () => {
  it("the browser guard and the server schema agree", () => {
    for (const value of [
      "banff",
      "lake-louise",
      "jasper",
      "BANFF",
      "",
      null,
      1,
    ]) {
      expect(isTripId(value), String(value)).toBe(
        tripIdSchema.safeParse(value).success
      )
    }
  })

  it("falls back to Banff for a missing or unknown ?to=", () => {
    expect(parseTripParam("edmonton")).toBe("edmonton")
    expect(parseTripParam("jasper")).toBe("banff")
    expect(parseTripParam(null)).toBe("banff")
  })
})
