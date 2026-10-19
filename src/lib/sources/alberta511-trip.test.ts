import { describe, expect, it } from "vitest"
import { z } from "zod"

import eventsFixture from "./__fixtures__/alberta511-events.json"
import stationsFixture from "./__fixtures__/alberta511-weatherstations.json"
import conditionsFixture from "./__fixtures__/alberta511-winterroads.json"
import {
  parseConditions,
  parseEvents,
  parseRecords,
  parseStations,
} from "./alberta511-trip"
import { SyncSourceError } from "./feed"

// Real responses saved 2026-10-19. Road conditions and events are the
// records near our routes plus a few far ones; weather stations are complete.

describe("511 road conditions", () => {
  const conditions = parseConditions(conditionsFixture)

  it("parses every saved record", () => {
    expect(conditions).toHaveLength((conditionsFixture as unknown[]).length)
  })

  it("decodes and simplifies the encoded polylines", () => {
    const hwy1 = conditions.find((c) => c.id === 238)! // Jct Hwy 40 to Jct Hwy 22
    expect(hwy1.roadway).toBe("Hwy 1")
    expect(hwy1.primaryCondition).toBe("Bare Dry")
    const points = hwy1.path.flat()
    // Simplified well below the ~1,900 points 511 sends, still in Alberta.
    expect(points.length).toBeGreaterThan(10)
    expect(points.length).toBeLessThan(600)
    for (const [lng, lat] of points) {
      expect(lat).toBeGreaterThan(50.9)
      expect(lat).toBeLessThan(51.3)
      expect(lng).toBeGreaterThan(-115.2)
      expect(lng).toBeLessThan(-114.3)
    }
  })

  it("trims padded values (511 sends 'Fog Patches' with trailing spaces)", () => {
    for (const condition of conditions) {
      for (const value of condition.secondaryConditions) {
        expect(value).toBe(value.trim())
      }
    }
  })

  it("converts LastUpdated from Unix seconds", () => {
    const hwy1 = conditions.find((c) => c.id === 238)!
    expect(hwy1.updatedAt.getUTCFullYear()).toBe(2026)
  })
})

describe("511 events", () => {
  const events = parseEvents(eventsFixture)

  it("parses every saved record", () => {
    expect(events).toHaveLength((eventsFixture as unknown[]).length)
  })

  it("keeps the fields the verdict needs", () => {
    const bearHill = events.find((e) => e.id === 12741)!
    expect(bearHill.eventType).toBe("roadwork")
    expect(bearHill.eventSubType).toBe("bridgeMaintenance")
    expect(bearHill.fullClosure).toBe(false)
    expect(bearHill.lanesAffected).toBe("1 Right lane closed")
    expect(bearHill.startsAt.toISOString()).toBe("2026-04-06T13:00:00.000Z")
    expect(bearHill.endsAt?.toISOString()).toBe("2026-10-31T01:00:00.000Z")
  })

  it("handles an open-ended event and a full closure", () => {
    const moraine = events.find((e) => e.id === 7)!
    expect(moraine.endsAt).toBeNull()
    expect(moraine.fullClosure).toBe(true)
  })
})

describe("511 weather stations", () => {
  const stations = parseStations(stationsFixture)

  it("parses all 116 stations", () => {
    expect(stations).toHaveLength(116)
  })

  it("turns string readings into numbers (Celsius, km/h)", () => {
    const hwy22 = stations.find((s) => s.id === 3573)!
    expect(hwy22.airTempC).toBe(10.6)
    expect(hwy22.windKmh).toBe(8.6)
    expect(hwy22.windDirDeg).toBe(54)
  })

  it("keeps a missing reading as null", () => {
    expect(stations.some((s) => s.pavementTempC === null)).toBe(true)
  })
})

describe("parseRecords", () => {
  const schema = z.number()

  it("skips a few bad records instead of failing the feed", () => {
    expect(parseRecords("test", [1, 2, "x", 3], schema)).toEqual([1, 2, 3])
  })

  it("fails when most records are invalid (a format change)", () => {
    expect(() => parseRecords("test", [1, "x", "y", "z"], schema)).toThrow(
      SyncSourceError
    )
  })

  it("fails when the response isn't a list", () => {
    expect(() =>
      parseRecords("test", { error: "Invalid Key" }, schema)
    ).toThrow(SyncSourceError)
  })
})
