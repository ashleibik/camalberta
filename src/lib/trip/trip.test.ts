import { describe, expect, it } from "vitest"

import {
  alberta511ResponseSchema,
  normalizeAlberta511,
} from "@/lib/sources/alberta511"
import {
  parseConditions,
  parseEvents,
  parseStations,
  type RoadCondition,
} from "@/lib/sources/alberta511-trip"
import cameraFixture from "@/lib/sources/__fixtures__/alberta511.json"
import eventsFixture from "@/lib/sources/__fixtures__/alberta511-events.json"
import stationsFixture from "@/lib/sources/__fixtures__/alberta511-weatherstations.json"
import conditionsFixture from "@/lib/sources/__fixtures__/alberta511-winterroads.json"

import {
  matchCameras,
  matchEvents,
  matchSegments,
  matchStations,
} from "./matching"
import { buildTripReport, computeTripVerdict, type TripData } from "./report"
import { nearestPlace, ROUTES } from "./routes"

// The fixtures are real 511 responses fetched at this moment, so "now" is
// pinned to it: which events are active depends on the clock.
const FETCHED_AT = new Date("2026-10-19T22:33:08Z")
const minutesAfter = (minutes: number) =>
  new Date(FETCHED_AT.getTime() + minutes * 60_000)

const conditions = parseConditions(conditionsFixture)
const events = parseEvents(eventsFixture)
const stations = parseStations(stationsFixture)
const cameras = normalizeAlberta511(
  alberta511ResponseSchema.parse(cameraFixture)
).map((c) => ({ ...c, status: "live" as const }))

const freshData: TripData = {
  conditions,
  events,
  stations,
  dataUpdatedAt: FETCHED_AT,
}

describe("route matching (real 511 data)", () => {
  it("matches Highway 1 segments end to end, and nothing beside it", () => {
    const matched = matchSegments(ROUTES["lake-louise"], conditions)
    expect(matched.map((s) => s.id)).toEqual([
      1347, 1001, 238, 237, 235, 233, 85, 84,
    ])
    for (const segment of matched) expect(segment.roadway).toBe("Hwy 1")
    // Contiguous coverage from Calgary to Lake Louise.
    expect(matched[0]!.fromKm).toBeLessThan(0.5)
    expect(matched.at(-1)!.toKm).toBeGreaterThan(167)
  })

  it("keeps Highway 2A and crossing roads off the QEII", () => {
    const matched = matchSegments(ROUTES.edmonton, conditions)
    const roadways = new Set(matched.map((s) => s.roadway))
    expect(roadways).toEqual(new Set(["Hwy 2"]))
    // 2A runs within 500 m of the QEII near Lacombe (segments 348, 349).
    expect(matched.some((s) => s.id === 348 || s.id === 349)).toBe(false)
    expect(matched.length).toBe(15)
  })

  it("shortens shared routes: Canmore stops at Canmore", () => {
    const ids = matchSegments(ROUTES.canmore, conditions).map((s) => s.id)
    expect(ids).toContain(235) // Banff Park Gates to Lac des Arcs (through Canmore)
    expect(ids).not.toContain(85) // Town of Banff to Taylor
  })

  it("matches events within 500 m, not the Moraine Lake closure 1.5 km off", () => {
    const matched = matchEvents(ROUTES["lake-louise"], events)
    expect(matched.some((e) => e.id === 12741)).toBe(true) // HWY-1 Bear Hill Rd
    expect(matched.some((e) => e.id === 7)).toBe(false) // Moraine Lake Rd
    for (const event of matched) expect(event.offsetM).toBeLessThanOrEqual(500)
  })

  it("matches the roadside weather stations along each route", () => {
    const hwy1 = matchStations(ROUTES["lake-louise"], stations).map((s) => s.id)
    expect(hwy1).toEqual(expect.arrayContaining([3573, 3572]))
    const hwy2 = matchStations(ROUTES.edmonton, stations).map((s) => s.id)
    expect(hwy2).toEqual(expect.arrayContaining([5453, 7355, 3303, 3306]))
  })
})

describe("camera ordering", () => {
  it("orders Highway 1 cameras in driving order with their distance from Calgary", () => {
    const matched = matchCameras(ROUTES["lake-louise"], cameras)
    const kms = matched.map((c) => c.km)
    expect(kms).toEqual([...kms].sort((a, b) => a - b))
    const names = matched.map((c) => c.name)
    const hwy22 = names.findIndex((n) => n.includes("West of Hwy 22"))
    const deadMans = names.findIndex((n) => n.includes("Dead Mans Flat"))
    const sunshine = names.findIndex((n) => n.includes("Sunshine Overpass"))
    expect(hwy22).toBeGreaterThanOrEqual(0)
    expect(hwy22).toBeLessThan(deadMans)
    expect(deadMans).toBeLessThan(sunshine)
    expect(matched[deadMans]!.km).toBeCloseTo(78.5, 0)
  })

  it("orders QEII cameras from Calgary to Edmonton", () => {
    const names = matchCameras(ROUTES.edmonton, cameras).map((c) => c.name)
    const balzac = names.findIndex((n) => n.includes("Balzac"))
    const ponoka = names.findIndex((n) => n.includes("near Ponoka"))
    const leduc = names.findIndex((n) => n.includes("near Leduc"))
    expect(balzac).toBeGreaterThanOrEqual(0)
    expect(balzac).toBeLessThan(ponoka)
    expect(ponoka).toBeLessThan(leduc)
  })

  it("leaves out cameras whose views are all disabled upstream", () => {
    // "Hwy 2: North of Hwy 11A Red Deer" is on the line, but 511 lists all
    // four of its views as Disabled.
    const names = matchCameras(ROUTES.edmonton, cameras).map((c) => c.name)
    expect(names.some((n) => n.includes("Hwy 11A Red Deer"))).toBe(false)
  })

  it("leaves out cameras more than 500 m from the line", () => {
    // Banff Ave at Moose St is ~1.2 km off the Lake Louise route (on the
    // Banff route it's in town, on the line).
    const lakeLouise = matchCameras(ROUTES["lake-louise"], cameras)
    expect(
      lakeLouise.some((c) => c.name.startsWith("Banff Ave at Moose St"))
    ).toBe(false)
    for (const camera of lakeLouise)
      expect(camera.offsetM).toBeLessThanOrEqual(500)
  })
})

describe("places", () => {
  it("names the nearest town along the route", () => {
    expect(nearestPlace(ROUTES.banff, 88)).toBe("Canmore")
    expect(nearestPlace(ROUTES.edmonton, 130)).toBe("Red Deer")
    expect(nearestPlace(ROUTES.edmonton, 0)).toBe("Calgary")
  })
})

describe("verdict on the real 2026-10-19 data", () => {
  it("is yellow on Highway 1 because of active construction, with reasons", () => {
    const verdict = computeTripVerdict("banff", freshData, FETCHED_AT)
    expect(verdict.level).toBe("yellow")
    expect(verdict.label).toBe("Drive carefully")
    expect(verdict.stale).toBe(false)
    const texts = verdict.reasons.map((r) => r.text)
    expect(texts).toContain("Bridge maintenance near Morley")
    expect(texts).toContain("Bridge construction near Calgary")
  })

  it("ignores construction that starts weeks from now", () => {
    // Sensor installation near Hwy 40 starts 2026-11-17.
    const verdict = computeTripVerdict("banff", freshData, FETCHED_AT)
    expect(
      verdict.reasons.some((r) => r.text.startsWith("Sensor installation"))
    ).toBe(false)
  })

  it("reports strong wind on Highway 2 at Edmonton", () => {
    const verdict = computeTripVerdict("edmonton", freshData, FETCHED_AT)
    expect(verdict.level).toBe("yellow")
    expect(verdict.reasons.map((r) => r.text)).toContain(
      "Strong wind near Edmonton"
    )
  })

  it("lists reasons worst first, then in driving order", () => {
    const verdict = computeTripVerdict("edmonton", freshData, FETCHED_AT)
    const kms = verdict.reasons.map((r) => r.km)
    expect(kms).toEqual([...kms].sort((a, b) => a - b))
  })
})

describe("verdict rules", () => {
  // The real Banff to Taylor segment, with no events, so only conditions count.
  const banffToTaylor = conditions.find((c) => c.id === 85)!
  const only = (segment: RoadCondition): TripData => ({
    conditions: [segment],
    events: [],
    stations: [],
    dataUpdatedAt: FETCHED_AT,
  })

  it("is green when the only segment is bare and dry", () => {
    const verdict = computeTripVerdict(
      "lake-louise",
      only(banffToTaylor),
      FETCHED_AT
    )
    expect(verdict.level).toBe("green")
    expect(verdict.label).toBe("Looks good")
    expect(verdict.reasons).toEqual([])
  })

  it("is red when a segment is closed, naming where", () => {
    const closed = { ...banffToTaylor, primaryCondition: "Closed" }
    const verdict = computeTripVerdict("lake-louise", only(closed), FETCHED_AT)
    expect(verdict.level).toBe("red")
    expect(verdict.label).toBe("Check before you go")
    expect(verdict.reasons[0]!.text).toMatch(/^Road closed near /)
  })

  it("is red for travel not recommended", () => {
    const tnr = { ...banffToTaylor, primaryCondition: "Travel Not Recommended" }
    expect(computeTripVerdict("lake-louise", only(tnr), FETCHED_AT).level).toBe(
      "red"
    )
  })

  it("is yellow for snow, ice or partly covered, whatever the wording", () => {
    for (const value of [
      "Partly Covered Snow",
      "Snow Covered",
      "Ice Covered",
      "Partly Ice Covered",
    ]) {
      const segment = { ...banffToTaylor, primaryCondition: value }
      const verdict = computeTripVerdict(
        "lake-louise",
        only(segment),
        FETCHED_AT
      )
      expect(verdict.level, value).toBe("yellow")
    }
  })

  it("is yellow for poor visibility and for frost", () => {
    const fog = { ...banffToTaylor, visibility: "Poor" }
    expect(
      computeTripVerdict("lake-louise", only(fog), FETCHED_AT).reasons[0]!.text
    ).toMatch(/^Poor visibility near /)
    const frost = { ...banffToTaylor, secondaryConditions: ["Frost"] }
    expect(
      computeTripVerdict("lake-louise", only(frost), FETCHED_AT).level
    ).toBe("yellow")
  })

  it("never shows green for a value it doesn't recognize", () => {
    const odd = { ...banffToTaylor, primaryCondition: "Something New" }
    expect(computeTripVerdict("lake-louise", only(odd), FETCHED_AT).level).toBe(
      "yellow"
    )
  })

  it("does not warn about rain alone", () => {
    const rain = { ...banffToTaylor, secondaryConditions: ["Rain"] }
    expect(
      computeTripVerdict("lake-louise", only(rain), FETCHED_AT).level
    ).toBe("green")
  })

  it("is red for a full closure event and for avalanche control", () => {
    const base = events.find((e) => e.id === 12741)! // HWY-1 Bear Hill Rd roadwork
    const closure = { ...base, fullClosure: true }
    const withClosure = { ...only(banffToTaylor), events: [closure] }
    const verdict = computeTripVerdict("banff", withClosure, FETCHED_AT)
    expect(verdict.level).toBe("red")
    expect(verdict.reasons[0]!.text).toBe("Road closed near Morley")

    const avalanche = {
      ...base,
      eventType: "closures",
      eventSubType: "avalancheControl",
    }
    const withAvalanche = { ...only(banffToTaylor), events: [avalanche] }
    expect(computeTripVerdict("banff", withAvalanche, FETCHED_AT).level).toBe(
      "red"
    )
  })

  it("treats over-dimensional loads as information only", () => {
    const base = events.find((e) => e.id === 12741)!
    const wideLoad = {
      ...base,
      eventType: "restrictionClass",
      eventSubType: "wideLoadReport",
    }
    const data = { ...only(banffToTaylor), events: [wideLoad] }
    expect(computeTripVerdict("lake-louise", data, FETCHED_AT).level).toBe(
      "green"
    )
  })
})

describe("stale and missing data", () => {
  const banffToTaylor = conditions.find((c) => c.id === 85)!
  const greenData: TripData = {
    conditions: [banffToTaylor],
    events: [],
    stations: [],
    dataUpdatedAt: FETCHED_AT,
  }

  it("still shows green at 30 minutes", () => {
    const verdict = computeTripVerdict(
      "lake-louise",
      greenData,
      minutesAfter(30)
    )
    expect(verdict.stale).toBe(false)
    expect(verdict.level).toBe("green")
  })

  it("never shows green once data is over 30 minutes old", () => {
    const verdict = computeTripVerdict(
      "lake-louise",
      greenData,
      minutesAfter(31)
    )
    expect(verdict.stale).toBe(true)
    expect(verdict.level).toBe("unknown")
    expect(verdict.label).toBe("Can't confirm")
  })

  it("keeps a yellow or red verdict when stale, flagged as stale", () => {
    const verdict = computeTripVerdict("banff", freshData, minutesAfter(90))
    expect(verdict.stale).toBe(true)
    expect(verdict.level).toBe("yellow")
  })

  it("can't confirm anything before the first sync", () => {
    const empty: TripData = {
      conditions: [],
      events: [],
      stations: [],
      dataUpdatedAt: null,
    }
    const verdict = computeTripVerdict("banff", empty, FETCHED_AT)
    expect(verdict.noData).toBe(true)
    expect(verdict.level).toBe("unknown")
  })
})

describe("buildTripReport", () => {
  const report = buildTripReport("edmonton", freshData, cameras, FETCHED_AT)

  it("describes the trip and its verdict", () => {
    expect(report.trip.name).toBe("Calgary to Edmonton")
    expect(report.trip.lengthKm).toBeGreaterThan(260)
    expect(report.verdict.level).toBe("yellow")
    expect(report.dataUpdatedAt).toBe(FETCHED_AT.toISOString())
  })

  it("lists segments in driving order with the nearest station's weather", () => {
    const froms = report.segments.map((s) => s.fromKm)
    expect(froms).toEqual([...froms].sort((a, b) => a - b))
    const withWeather = report.segments.filter((s) => s.weather !== null)
    expect(withWeather.length).toBeGreaterThan(report.segments.length / 2)
    for (const segment of withWeather) {
      expect(segment.weather!.airTempC).toBeGreaterThan(-60)
    }
  })

  it("has no weather inside Banff National Park rather than a far-away reading", () => {
    const lakeLouise = buildTripReport(
      "lake-louise",
      freshData,
      cameras,
      FETCHED_AT
    )
    const taylorToLakeLouise = lakeLouise.segments.find((s) => s.id === 84)!
    expect(taylorToLakeLouise.weather).toBeNull()
  })

  it("only includes events active now or starting within 12 hours", () => {
    for (const event of report.events) {
      expect(new Date(event.startsAt).getTime()).toBeLessThanOrEqual(
        FETCHED_AT.getTime() + 12 * 3_600_000
      )
    }
  })
})
