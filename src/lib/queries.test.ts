import { fileURLToPath } from "node:url"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { Database } from "@/lib/db"
import * as schema from "@/lib/db/schema"

import { getHealth } from "./queries"

let client: PGlite
type DbGlobal = typeof globalThis & { __camalbertaDb?: Database }

beforeAll(async () => {
  client = new PGlite()
  const db = drizzle({ client, schema })
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)),
  })
  ;(globalThis as DbGlobal).__camalbertaDb = db
}, 30_000)

afterAll(async () => {
  ;(globalThis as DbGlobal).__camalbertaDb = undefined
  await client.close()
})

const camera = (
  id: string,
  status: schema.CameraStatus,
  lastSeenAt: string
): schema.NewCamera => {
  const [source, sourceId] = id.split(":") as [schema.CameraSource, string]
  return {
    id,
    source,
    sourceId,
    name: id,
    area: "calgary",
    lat: 51,
    lng: -114,
    imageUrl: "https://trafficcam.calgary.ca/x.jpg",
    status,
    lastSeenAt: new Date(lastSeenAt),
  }
}

describe("getHealth", () => {
  it("reports nothing for an empty database", async () => {
    const health = await getHealth()
    expect(health.sources).toEqual([])
    expect(health.lastSyncAt).toBeNull()
  })

  it("reports when the schedule last ran, and when it's late", async () => {
    const db = (globalThis as DbGlobal).__camalbertaDb!
    const empty = await getHealth()
    expect(empty.lastCollectAt).toBeNull()
    expect(empty.syncLate).toBe(true)

    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000)
    await db
      .insert(schema.syncState)
      .values({ key: schema.COLLECT_RUN_KEY, at: tenMinutesAgo })
    await db
      .insert(schema.cameras)
      .values(camera("calgary:fresh", "live", tenMinutesAgo.toISOString()))
    const health = await getHealth()
    expect(health.lastCollectAt).toBe(tenMinutesAgo.toISOString())
    expect(health.syncLate).toBe(false)
    await db.delete(schema.cameras)
  })

  it("counts cameras per source and status, with the last sync time", async () => {
    const db = (globalThis as DbGlobal).__camalbertaDb!
    await db
      .insert(schema.cameras)
      .values([
        camera("calgary:loc1", "live", "2026-10-20T08:00:00Z"),
        camera("calgary:loc2", "stale", "2026-10-20T08:05:00Z"),
        camera("calgary:loc3", "offline", "2026-10-19T08:00:00Z"),
        camera("banff:bear", "live", "2026-10-20T07:00:00Z"),
      ])
    const health = await getHealth()
    expect(health.sources).toEqual([
      {
        source: "banff",
        total: 1,
        live: 1,
        stale: 0,
        offline: 0,
        lastSeenAt: "2026-10-20T07:00:00.000Z",
      },
      {
        source: "calgary",
        total: 3,
        live: 1,
        stale: 1,
        offline: 1,
        lastSeenAt: "2026-10-20T08:05:00.000Z",
      },
    ])
    expect(health.lastSyncAt).toBe("2026-10-20T08:05:00.000Z")
  })
})
