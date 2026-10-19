import "server-only"

import { z } from "zod"

import { env } from "@/lib/env"
import { decodePolyline, simplifyPath } from "@/lib/trip/geo"

import { fetchFeedJson, SyncSourceError } from "./feed"

/**
 * 511 Alberta road conditions, events and weather stations, for Trip Check.
 * Schemas come from real responses (fixtures saved 2026-10-19:
 * __fixtures__/alberta511-winterroads.json, -events.json,
 * -weatherstations.json), not from the docs, which differ in places:
 * - Road Conditions is a v3 endpoint, and its keys contain spaces
 *   ("Primary Condition", "Secondary Conditions").
 * - Weather station values are strings, and are Celsius and km/h. The docs
 *   say Fahrenheit, but a cross-check against Open-Meteo at five stations
 *   matched Celsius within 1-4 degrees.
 */

export const ALBERTA511_TRIP_ENDPOINTS = {
  conditions: "https://511.alberta.ca/api/v3/get/winterroads",
  events: "https://511.alberta.ca/api/v2/get/event",
  stations: "https://511.alberta.ca/api/v2/get/weatherstations",
} as const

const unixSeconds = z.number().int().positive()

// "Primary Condition" etc. Seen values are short; cap anything absurd.
const shortText = z.string().max(200)

const winterRoadSchema = z.object({
  Id: z.number().int(),
  LocationDescription: shortText.nullable(),
  "Primary Condition": shortText,
  "Secondary Conditions": z.array(shortText),
  Visibility: shortText.nullable(),
  AreaName: shortText.nullable(),
  RoadwayName: shortText,
  EncodedPolyline: z.array(z.string().max(200_000)),
  LastUpdated: unixSeconds,
})

const eventSchema = z.object({
  ID: z.number().int(),
  RoadwayName: shortText,
  DirectionOfTravel: shortText,
  Description: z.string().max(5_000),
  StartDate: unixSeconds,
  PlannedEndDate: unixSeconds.nullable(),
  LanesAffected: shortText,
  Latitude: z.number().min(-90).max(90),
  Longitude: z.number().min(-180).max(180),
  LatitudeSecondary: z.number().min(-90).max(90).nullable(),
  LongitudeSecondary: z.number().min(-180).max(180).nullable(),
  EventType: shortText,
  EventSubType: shortText,
  IsFullClosure: z.boolean(),
  Severity: shortText,
  LastUpdated: unixSeconds,
})

// Readings are strings ("12.1") or null. Anything non-numeric becomes null.
const reading = z
  .union([z.string().max(32), z.number(), z.null()])
  .transform((value) => {
    if (value === null) return null
    const n = typeof value === "number" ? value : Number(value.trim())
    return value === "" || !Number.isFinite(n) ? null : n
  })

const stationSchema = z.object({
  Id: z.number().int(),
  Latitude: z.number().min(-90).max(90),
  Longitude: z.number().min(-180).max(180),
  LastUpdated: unixSeconds,
  AirTemperature: reading,
  PavementTemperature: reading,
  WindSpeed: reading,
  WindDirection: reading,
  RelativeHumidity: reading,
})

export type WinterRoadRecord = z.infer<typeof winterRoadSchema>
export type EventRecord = z.infer<typeof eventSchema>
export type StationRecord = z.infer<typeof stationSchema>

/** A road condition segment as we store it. */
export interface RoadCondition {
  id: number
  roadway: string
  location: string | null
  areaName: string | null
  primaryCondition: string
  secondaryConditions: string[]
  visibility: string | null
  /** Simplified [lng, lat] lines (a segment can have several parts). */
  path: [number, number][][]
  updatedAt: Date
}

export interface RoadEvent {
  id: number
  roadway: string | null
  description: string
  eventType: string
  eventSubType: string
  severity: string
  fullClosure: boolean
  lanesAffected: string | null
  direction: string | null
  lat: number
  lng: number
  lat2: number | null
  lng2: number | null
  startsAt: Date
  endsAt: Date | null
  updatedAt: Date
}

export interface WeatherStation {
  id: number
  lat: number
  lng: number
  airTempC: number | null
  pavementTempC: number | null
  windKmh: number | null
  windDirDeg: number | null
  humidityPct: number | null
  observedAt: Date
}

/**
 * Validate each record of a list response on its own: one odd record is
 * skipped instead of failing the feed, but a feed that is mostly invalid (or
 * not a list at all) fails, so a format change is noticed.
 */
export function parseRecords<T>(
  label: string,
  json: unknown,
  schema: z.ZodType<T>
): T[] {
  if (!Array.isArray(json)) {
    throw new SyncSourceError(`${label} response was not a list`)
  }
  const records: T[] = []
  for (const item of json) {
    const parsed = schema.safeParse(item)
    if (parsed.success) records.push(parsed.data)
  }
  if (json.length > 0 && records.length < json.length / 2) {
    throw new SyncSourceError(`${label} records failed validation`)
  }
  return records
}

const clean = (value: string | null | undefined): string | null => {
  const text = value?.trim().replace(/\s+/g, " ")
  return text ? text : null
}

const fromUnix = (seconds: number) => new Date(seconds * 1000)

// 511 polylines are dense (a point every ~10 m). 10 m keeps every bend that
// matters for a 150 m match and shrinks what we store about 10x.
const PATH_SIMPLIFY_M = 10
const round5 = (n: number) => Math.round(n * 1e5) / 1e5

export function normalizeCondition(
  record: WinterRoadRecord
): RoadCondition | null {
  const path: [number, number][][] = []
  for (const encoded of record.EncodedPolyline) {
    let points: [number, number][]
    try {
      points = decodePolyline(encoded)
    } catch {
      continue
    }
    if (points.length === 0) continue
    path.push(
      simplifyPath(points, PATH_SIMPLIFY_M).map(([lng, lat]) => [
        round5(lng),
        round5(lat),
      ])
    )
  }
  const primary = clean(record["Primary Condition"])
  if (path.length === 0 || !primary) return null

  return {
    id: record.Id,
    roadway: clean(record.RoadwayName) ?? "Unnamed road",
    location: clean(record.LocationDescription),
    areaName: clean(record.AreaName),
    primaryCondition: primary,
    secondaryConditions: record["Secondary Conditions"]
      .map((value) => clean(value))
      .filter((value): value is string => value !== null),
    visibility: clean(record.Visibility),
    path,
    updatedAt: fromUnix(record.LastUpdated),
  }
}

export function normalizeEvent(record: EventRecord): RoadEvent {
  const direction = clean(record.DirectionOfTravel)
  const hasSecond =
    record.LatitudeSecondary !== null && record.LongitudeSecondary !== null
  return {
    id: record.ID,
    roadway: clean(record.RoadwayName),
    description: clean(record.Description) ?? "",
    eventType: clean(record.EventType) ?? "",
    eventSubType: clean(record.EventSubType) ?? "",
    severity: clean(record.Severity) ?? "Unknown",
    fullClosure: record.IsFullClosure,
    lanesAffected: clean(record.LanesAffected),
    direction: direction && !/^unknown$/i.test(direction) ? direction : null,
    lat: record.Latitude,
    lng: record.Longitude,
    lat2: hasSecond ? record.LatitudeSecondary : null,
    lng2: hasSecond ? record.LongitudeSecondary : null,
    startsAt: fromUnix(record.StartDate),
    endsAt:
      record.PlannedEndDate === null ? null : fromUnix(record.PlannedEndDate),
    updatedAt: fromUnix(record.LastUpdated),
  }
}

const inRange = (value: number | null, min: number, max: number) =>
  value !== null && value >= min && value <= max ? value : null

export function normalizeStation(record: StationRecord): WeatherStation {
  return {
    id: record.Id,
    lat: record.Latitude,
    lng: record.Longitude,
    // Drop sensor glitches rather than show them.
    airTempC: inRange(record.AirTemperature, -60, 50),
    pavementTempC: inRange(record.PavementTemperature, -60, 80),
    windKmh: inRange(record.WindSpeed, 0, 250),
    windDirDeg: inRange(record.WindDirection, 0, 360),
    humidityPct: inRange(record.RelativeHumidity, 0, 100),
    observedAt: fromUnix(record.LastUpdated),
  }
}

export function parseConditions(json: unknown): RoadCondition[] {
  return parseRecords("511 road conditions", json, winterRoadSchema)
    .map(normalizeCondition)
    .filter((c): c is RoadCondition => c !== null)
}

export function parseEvents(json: unknown): RoadEvent[] {
  return parseRecords("511 events", json, eventSchema).map(normalizeEvent)
}

export function parseStations(json: unknown): WeatherStation[] {
  return parseRecords("511 weather stations", json, stationSchema).map(
    normalizeStation
  )
}

/** Fetch one 511 dataset. The key is in the URL, which is never logged. */
async function fetch511(label: string, endpoint: string): Promise<unknown> {
  if (!env.ALBERTA_511_API_KEY) {
    throw new SyncSourceError("511 Alberta is not configured")
  }
  const url = new URL(endpoint)
  url.searchParams.set("format", "json")
  url.searchParams.set("key", env.ALBERTA_511_API_KEY)
  return fetchFeedJson(label, url, { headers: { accept: "application/json" } })
}

export async function fetchConditions(): Promise<RoadCondition[]> {
  return parseConditions(
    await fetch511("511 road conditions", ALBERTA511_TRIP_ENDPOINTS.conditions)
  )
}

export async function fetchEvents(): Promise<RoadEvent[]> {
  return parseEvents(
    await fetch511("511 events", ALBERTA511_TRIP_ENDPOINTS.events)
  )
}

export async function fetchStations(): Promise<WeatherStation[]> {
  return parseStations(
    await fetch511("511 weather stations", ALBERTA511_TRIP_ENDPOINTS.stations)
  )
}
