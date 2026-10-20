import type {
  TripCamera,
  TripEvent,
  TripReport,
  TripSegment,
} from "@/lib/api-types"
import type { CameraSource, CameraStatus } from "@/lib/db/schema"
import type {
  RoadCondition,
  RoadEvent,
  WeatherStation,
} from "@/lib/sources/alberta511-trip"

import { simplifyPath } from "./geo"
import {
  matchCameras,
  matchEvents,
  matchSegments,
  matchStations,
  nearestStation,
} from "./matching"
import { nearestPlace, ROUTES } from "./routes"
import type { TripId } from "./trips"
import {
  classifyCondition,
  classifyEvent,
  computeVerdict,
  isEventRelevant,
  worstLevel,
  type Verdict,
} from "./verdict"

/** Everything stored from 511 that Trip Check needs, as read from the DB. */
export interface TripData {
  conditions: readonly RoadCondition[]
  events: readonly RoadEvent[]
  stations: readonly WeatherStation[]
  /**
   * When the road data was last refreshed: the older of the conditions and
   * events syncs (null if either never succeeded).
   */
  dataUpdatedAt: Date | null
}

export interface CameraInput {
  id: string
  name: string
  source: CameraSource
  status: CameraStatus
  lat: number
  lng: number
}

const round1 = (n: number) => Math.round(n * 10) / 10
const round4 = (n: number) => Math.round(n * 1e4) / 1e4

// Paths are stored at 10 m for matching; for display (the route drawing is
// ~0.6 km per pixel, the map opens zoomed out) 40 m is plenty and cuts the
// report the page carries by about two thirds.
const DISPLAY_SIMPLIFY_M = 40

function displayPath(path: readonly (readonly [number, number])[][]) {
  return path.map((part) =>
    simplifyPath(part, DISPLAY_SIMPLIFY_M).map(
      ([lng, lat]) => [round4(lng), round4(lat)] as [number, number]
    )
  )
}

function eventFacts(event: RoadEvent) {
  return {
    type: event.eventType,
    subType: event.eventSubType,
    severity: event.severity,
    fullClosure: event.fullClosure,
    lanesAffected: event.lanesAffected ?? "",
    description: event.description,
  }
}

/** Just the verdict for a trip (what push alerts compare). */
export function computeTripVerdict(
  trip: TripId,
  data: TripData,
  now: Date
): Verdict {
  const route = ROUTES[trip]
  const segments = matchSegments(route, data.conditions)
  const events = matchEvents(route, data.events)
  return computeVerdict({
    segments: segments.map((s) => ({
      primary: s.primaryCondition,
      secondary: s.secondaryConditions,
      visibility: s.visibility,
      fromKm: s.fromKm,
      toKm: s.toKm,
    })),
    events: events.map((e) => ({
      ...eventFacts(e),
      km: e.km,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
    })),
    dataUpdatedAt: data.dataUpdatedAt,
    now,
    placeAt: (km) => nearestPlace(route, km),
  })
}

/** The full Trip Check page data for one trip. */
export function buildTripReport(
  trip: TripId,
  data: TripData,
  cameras: readonly CameraInput[],
  now: Date
): TripReport {
  const route = ROUTES[trip]
  const verdict = computeTripVerdict(trip, data, now)
  const stations = matchStations(route, data.stations)

  const segments: TripSegment[] = matchSegments(route, data.conditions).map(
    (s) => {
      const findings = classifyCondition({
        primary: s.primaryCondition,
        secondary: s.secondaryConditions,
        visibility: s.visibility,
      })
      const station = nearestStation(stations, s.fromKm, s.toKm)
      return {
        id: s.id,
        roadway: s.roadway,
        location: s.location,
        primaryCondition: s.primaryCondition,
        secondaryConditions: s.secondaryConditions,
        visibility: s.visibility,
        level: worstLevel(findings.map((f) => f.level)),
        findings: findings.map(({ level, text }) => ({ level, text })),
        fromKm: round1(s.fromKm),
        toKm: round1(s.toKm),
        updatedAt: s.updatedAt.toISOString(),
        weather: station
          ? {
              stationId: station.id,
              km: round1(station.km),
              airTempC: station.airTempC,
              pavementTempC: station.pavementTempC,
              windKmh: station.windKmh,
              windDirDeg: station.windDirDeg,
              observedAt: station.observedAt.toISOString(),
            }
          : null,
        path: displayPath(s.path),
      }
    }
  )

  const events: TripEvent[] = matchEvents(route, data.events)
    .filter((e) => isEventRelevant(e, now))
    .map((e) => {
      const finding = classifyEvent(eventFacts(e))
      return {
        id: e.id,
        roadway: e.roadway,
        description: e.description,
        label: finding.text,
        level: finding.level,
        direction: e.direction,
        km: round1(e.km),
        lat: e.lat,
        lng: e.lng,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt?.toISOString() ?? null,
        upcoming: e.startsAt.getTime() > now.getTime(),
      }
    })

  const tripCameras: TripCamera[] = matchCameras(route, cameras).map((c) => ({
    id: c.id,
    name: c.name,
    source: c.source,
    status: c.status,
    km: round1(c.km),
    lat: c.lat,
    lng: c.lng,
  }))

  return {
    trip: {
      id: trip,
      name: route.name,
      highway: route.highway,
      from: route.from,
      to: route.to,
      lengthKm: round1(route.line.lengthM / 1000),
    },
    verdict: {
      level: verdict.level,
      label: verdict.label,
      reasons: verdict.reasons.map((r) => ({ ...r, km: round1(r.km) })),
      stale: verdict.stale,
      noData: verdict.noData,
    },
    dataUpdatedAt: data.dataUpdatedAt?.toISOString() ?? null,
    generatedAt: now.toISOString(),
    route: {
      coordinates: route.line.coords.map(([lng, lat]) => [
        round4(lng),
        round4(lat),
      ]),
      places: route.places.map((p) => ({ name: p.name, km: p.km })),
    },
    cameras: tripCameras,
    segments,
    events,
  }
}
