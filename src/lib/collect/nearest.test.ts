import { describe, expect, it } from "vitest"

import {
  nearestSegment,
  nearestStation,
  prepareSegments,
  segmentsNearPoints,
  stationsNearPoints,
} from "./nearest"

// A west-east line along 51.18 N near Banff (about 700 m long).
const highway = {
  id: 1,
  path: [
    [
      [-115.57, 51.18],
      [-115.56, 51.18],
    ],
  ] as [number, number][][],
}
// Same shape 0.01 degrees (about 1.1 km) further north.
const farRoad = {
  id: 2,
  path: [
    [
      [-115.57, 51.19],
      [-115.56, 51.19],
    ],
  ] as [number, number][][],
}

// About 100 m north of the highway, halfway along.
const camera = { lat: 51.1809, lng: -115.565 }

describe("nearestSegment", () => {
  it("finds the closest segment within reach", () => {
    const segments = prepareSegments([highway, farRoad], 300)
    const best = nearestSegment(camera, segments)
    expect(best?.item.id).toBe(1)
    expect(best?.distanceM).toBeGreaterThan(90)
    expect(best?.distanceM).toBeLessThan(110)
  })

  it("returns null when every segment is out of reach", () => {
    const segments = prepareSegments([highway, farRoad], 50)
    expect(nearestSegment(camera, segments)).toBeNull()
  })

  it("skips path parts too short to be a line", () => {
    const stub = {
      id: 3,
      path: [[[-115.565, 51.1809]]] as [number, number][][],
    }
    expect(nearestSegment(camera, prepareSegments([stub], 300))).toBeNull()
  })
})

describe("nearestStation", () => {
  const stations = [
    { id: 10, lat: 51.2, lng: -115.6 }, // ~3.3 km
    { id: 11, lat: 51.4, lng: -115.9 }, // ~33 km
  ]

  it("picks the closest station within the limit", () => {
    expect(nearestStation(camera, stations, 30_000)?.item.id).toBe(10)
  })

  it("returns null beyond the limit", () => {
    expect(nearestStation(camera, stations, 1_000)).toBeNull()
  })
})

describe("near points", () => {
  it("keeps only segments near some camera", () => {
    expect(
      segmentsNearPoints([highway, farRoad], [camera], 300).map((s) => s.id)
    ).toEqual([1])
    expect(segmentsNearPoints([highway], [], 300)).toEqual([])
  })

  it("keeps only stations near some camera", () => {
    const stations = [
      { id: 10, lat: 51.2, lng: -115.6 },
      { id: 11, lat: 51.4, lng: -115.9 },
    ]
    expect(
      stationsNearPoints(stations, [camera], 30_000).map((s) => s.id)
    ).toEqual([10])
  })
})
