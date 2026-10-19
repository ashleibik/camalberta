import { describe, expect, it } from "vitest"

import {
  decodePolyline,
  haversineM,
  locateOnLine,
  prepareLine,
  simplifyPath,
} from "./geo"

describe("decodePolyline", () => {
  it("decodes Google's reference example to [lng, lat] pairs", () => {
    // From Google's Encoded Polyline Algorithm documentation.
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ])
  })

  it("rejects truncated input instead of inventing points", () => {
    expect(() => decodePolyline("_p~iF~ps|U_")).toThrow()
  })

  it("rejects characters outside the encoding alphabet", () => {
    expect(() => decodePolyline("_p~iF~ps|U ")).toThrow()
  })
})

describe("simplifyPath", () => {
  it("drops points that sit on a straight line", () => {
    const line: [number, number][] = [
      [-114, 51],
      [-113.99, 51],
      [-113.98, 51],
      [-113.97, 51],
    ]
    expect(simplifyPath(line, 5)).toEqual([
      [-114, 51],
      [-113.97, 51],
    ])
  })

  it("keeps a bend larger than the tolerance", () => {
    const bend: [number, number][] = [
      [-114, 51],
      [-113.99, 51.01],
      [-113.98, 51],
    ]
    expect(simplifyPath(bend, 10)).toHaveLength(3)
  })
})

describe("locateOnLine", () => {
  // A 10 km east-west line at Calgary's latitude.
  const line = prepareLine(
    [
      [-114.2, 51.08],
      [-114.06, 51.08],
    ],
    2_000
  )

  it("measures length with the haversine formula", () => {
    expect(line.lengthM).toBeCloseTo(
      haversineM([-114.2, 51.08], [-114.06, 51.08])
    )
    expect(line.lengthM / 1000).toBeCloseTo(9.79, 1)
  })

  it("reports offset and distance along for a nearby point", () => {
    // ~111 m north of the line's midpoint.
    const at = locateOnLine(line, [-114.13, 51.081])
    expect(at).not.toBeNull()
    expect(at!.offsetM).toBeCloseTo(111, -1)
    expect(at!.alongM / 1000).toBeCloseTo(4.9, 1)
  })

  it("returns null beyond the index distance", () => {
    expect(locateOnLine(line, [-114.13, 51.1])).toBeNull() // ~2.2 km away
    expect(locateOnLine(line, [-113.5, 53.5])).toBeNull()
  })
})
