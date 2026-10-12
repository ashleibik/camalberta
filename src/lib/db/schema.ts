import { sql } from "drizzle-orm"
import {
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

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
