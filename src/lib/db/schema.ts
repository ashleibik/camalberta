import { sql } from "drizzle-orm"
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import type { TripId } from "@/lib/trip/trips"

/**
 * Known camera sources. Each has an adapter in src/lib/sources/.
 * Stored as text (not a PG enum) so adding a source needs no migration.
 */
export const CAMERA_SOURCES = [
  "calgary",
  "alberta511",
  "banff",
  "sunshine",
  "edmonton",
] as const
export type CameraSource = (typeof CAMERA_SOURCES)[number]

/** Freshness of a camera, driven by the sync job and the image proxy. */
export const CAMERA_STATUSES = ["live", "stale", "offline"] as const
export type CameraStatus = (typeof CAMERA_STATUSES)[number]

export const cameras = pgTable(
  "cameras",
  {
    // Our own stable id: `${source}:${sourceId}`. The client only ever sees
    // this, never an upstream URL.
    id: text("id").primaryKey(),
    source: text("source").$type<CameraSource>().notNull(),
    sourceId: text("source_id").notNull(),
    name: text("name").notNull(),
    road: text("road"),
    direction: text("direction"),
    quadrant: text("quadrant"),
    area: text("area").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    // Upstream media URL: a still image, or an HLS playlist for video sources
    // (see src/lib/media.ts). Server-side only; never sent to the browser.
    imageUrl: text("image_url").notNull(),
    status: text("status").$type<CameraStatus>().notNull().default("live"),
    // Last time this camera was present in an upstream sync.
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [
    uniqueIndex("cameras_source_source_id_idx").on(
      table.source,
      table.sourceId
    ),
    index("cameras_area_idx").on(table.area),
    index("cameras_status_idx").on(table.status),
  ]
)

export type Camera = typeof cameras.$inferSelect
export type NewCamera = typeof cameras.$inferInsert

// ---------------------------------------------------------------------------
// Trip Check (Phase 6B). 511 Alberta road data, refreshed by the sync job and
// trimmed to what lies near our trip routes. Each table is replaced as a
// whole when its feed syncs successfully.
// ---------------------------------------------------------------------------

/** 511 road condition segments ("winterroads") along our routes. */
export const roadConditions = pgTable("road_conditions", {
  // 511's own id.
  id: integer("id").primaryKey(),
  roadway: text("roadway").notNull(),
  location: text("location"),
  areaName: text("area_name"),
  primaryCondition: text("primary_condition").notNull(),
  secondaryConditions: jsonb("secondary_conditions")
    .$type<string[]>()
    .notNull(),
  visibility: text("visibility"),
  // Simplified [lng, lat] lines; a segment can have several parts.
  path: jsonb("path").$type<[number, number][][]>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

/** 511 events (closures, collisions, construction) near our routes. */
export const roadEvents = pgTable("road_events", {
  id: integer("id").primaryKey(),
  roadway: text("roadway"),
  description: text("description").notNull(),
  eventType: text("event_type").notNull(),
  eventSubType: text("event_sub_type").notNull(),
  severity: text("severity").notNull(),
  fullClosure: boolean("full_closure").notNull(),
  lanesAffected: text("lanes_affected"),
  direction: text("direction"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  // Optional second point (the far end of a work zone).
  lat2: doublePrecision("lat2"),
  lng2: doublePrecision("lng2"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
})

/** 511 road weather stations near our routes. Celsius and km/h. */
export const weatherStations = pgTable("weather_stations", {
  id: integer("id").primaryKey(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  airTempC: doublePrecision("air_temp_c"),
  pavementTempC: doublePrecision("pavement_temp_c"),
  windKmh: doublePrecision("wind_kmh"),
  windDirDeg: doublePrecision("wind_dir_deg"),
  humidityPct: doublePrecision("humidity_pct"),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
})

/**
 * Small key/time store for the sync job: when each 511 feed last synced
 * successfully, and the shared 511 call window (their limit is 10 calls per
 * 60 seconds, across every instance of the app).
 */
export const syncState = pgTable("sync_state", {
  key: text("key").primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull(),
})

/** Verdict levels as stored for push alerts. */
export const TRIP_LEVELS = ["green", "yellow", "red"] as const
export type TripLevel = (typeof TRIP_LEVELS)[number]

/**
 * Browser push subscriptions for "Notify me if this trip gets worse". Only
 * what delivery needs: the push service endpoint and its keys, and the trip.
 * No account, email, IP address or user agent. `baseline` (the verdict the
 * subscriber was last told about, or saw when subscribing) and
 * `lastNotifiedAt` implement "only when it gets worse, at most once an hour".
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    endpoint: text("endpoint").notNull(),
    trip: text("trip").$type<TripId>().notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    baseline: text("baseline").$type<TripLevel>(),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.endpoint, table.trip] }),
    index("push_subscriptions_trip_idx").on(table.trip),
  ]
)

export type RoadConditionRow = typeof roadConditions.$inferSelect
export type RoadEventRow = typeof roadEvents.$inferSelect
export type WeatherStationRow = typeof weatherStations.$inferSelect
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect
