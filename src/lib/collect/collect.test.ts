import { fileURLToPath } from "node:url"

import { PGlite } from "@electric-sql/pglite"
import { asc, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import sharp from "sharp"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { Database } from "@/lib/db"
import * as schema from "@/lib/db/schema"
import type { NewCamera } from "@/lib/db/schema"
import type { SnapshotStorage } from "@/lib/storage/snapshots"

import { runCollection } from "./collect"
import {
  listForReview,
  parseReviewQuery,
  reviewCounts,
  setHumanLabel,
} from "./review"

// A real (in-memory) database with our migrations, real images made with
// sharp, and a fake upstream: the whole collection path except the network.

const NOW = new Date("2026-10-19T20:00:00Z")
const FRESH = NOW.getTime() - 60_000
const FROZEN = NOW.getTime() - 2 * 3_600_000

let client: PGlite
let db: Database

const stored = new Map<string, Uint8Array>()
const storage: SnapshotStorage = {
  kind: "local",
  async put(key, data) {
    stored.set(key, data)
  },
  async get(key) {
    return stored.get(key) ?? null
  },
}

async function jpeg(colour: string): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({
      create: { width: 1280, height: 720, channels: 3, background: colour },
    })
      .jpeg()
      .toBuffer()
  )
}

const camera = (
  id: string,
  imageUrl: string,
  extra: Partial<NewCamera> = {}
): NewCamera => {
  const [source, sourceId] = id.split(":") as [NewCamera["source"], string]
  return {
    id,
    source,
    sourceId,
    name: id,
    area: "bow_valley",
    lat: 51.1809,
    lng: -115.565,
    imageUrl,
    ...extra,
  }
}

// What each upstream URL serves this run: image bytes and Last-Modified.
let upstream: Record<string, { bytes: Uint8Array; at: number } | "down"> = {}
const fakeFetch = async (url: string): Promise<Response> => {
  const photo = upstream[url]
  if (!photo || photo === "down") return new Response(null, { status: 503 })
  return new Response(photo.bytes as BodyInit, {
    headers: {
      "content-type": "image/jpeg",
      "last-modified": new Date(photo.at).toUTCString(),
    },
  })
}

const URLS = {
  highway: "https://511.alberta.ca/map/Cctv/100",
  town: "https://ftp.banff.ca/images/bear.jpg",
  frozen: "https://ftp.banff.ca/images/frozen.jpg",
  broken: "https://ftp.banff.ca/images/broken.jpg",
}

beforeAll(async () => {
  client = new PGlite()
  const pglite = drizzle({ client, schema })
  await migrate(pglite, {
    migrationsFolder: fileURLToPath(
      new URL("../../../drizzle", import.meta.url)
    ),
  })
  db = pglite
  // review.ts uses getDb(); point it at this database.
  ;(globalThis as { __camalbertaDb?: Database }).__camalbertaDb = db

  await db.insert(schema.cameras).values([
    camera("alberta511:100-1", URLS.highway),
    camera("banff:bear", URLS.town, { lat: 51.175, lng: -115.571 }),
    camera("banff:frozen", URLS.frozen),
    camera("banff:broken", URLS.broken),
    // Not collected: ski resort, another area, offline.
    camera("sunshine:1", "https://cameras.skibanff.com/dynamic/1m"),
    camera("calgary:loc1", "https://trafficcam.calgary.ca/loc1.jpg", {
      area: "calgary",
    }),
    camera("alberta511:200-1", "https://511.alberta.ca/map/Cctv/200", {
      status: "offline",
    }),
  ])
  // A 511 segment ~100 m south of the highway camera, out of reach of the
  // town camera (about 560 m away).
  await db.insert(schema.roadConditions).values({
    id: 5,
    roadway: "Highway 1",
    primaryCondition: "Bare Wet",
    secondaryConditions: [],
    visibility: "Good",
    path: [
      [
        [-115.57, 51.18],
        [-115.56, 51.18],
      ],
    ],
    updatedAt: new Date(NOW.getTime() - 600_000),
  })
  await db.insert(schema.weatherStations).values({
    id: 9,
    lat: 51.2,
    lng: -115.6,
    airTempC: 2.5,
    pavementTempC: 4,
    windKmh: 12,
    humidityPct: 80,
    observedAt: new Date(NOW.getTime() - 300_000),
  })
}, 30_000)

afterAll(async () => {
  ;(globalThis as { __camalbertaDb?: Database }).__camalbertaDb = undefined
  await client.close()
})

describe("runCollection", () => {
  it("saves one resized snapshot per working road camera", async () => {
    upstream = {
      [URLS.highway]: { bytes: await jpeg("#6b7280"), at: FRESH },
      [URLS.town]: { bytes: await jpeg("#9ca3af"), at: FRESH },
      [URLS.frozen]: { bytes: await jpeg("#4b5563"), at: FROZEN },
      [URLS.broken]: "down",
    }
    const result = await runCollection({
      db,
      storage,
      fetchImpl: fakeFetch,
      now: () => NOW,
    })
    expect(result).toMatchObject({
      storage: "local",
      cameras: 4,
      saved: 2,
      unchanged: 0,
      stale: 1,
      failed: 1,
    })

    const rows = await db
      .select()
      .from(schema.snapshots)
      .orderBy(asc(schema.snapshots.cameraId))
    expect(rows.map((r) => r.cameraId)).toEqual([
      "alberta511:100-1",
      "banff:bear",
    ])

    const [highway, town] = rows as [schema.SnapshotRow, schema.SnapshotRow]
    expect(highway).toMatchObject({
      width: 512,
      height: 288,
      photoAt: new Date(Math.floor(FRESH / 1000) * 1000),
      conditionId: 5,
      conditionPrimary: "Bare Wet",
      stationId: 9,
      airTempC: 2.5,
      autoLabel: "wet",
      humanLabel: null,
      reviewedAt: null,
    })
    expect(highway.conditionDistanceM).toBeGreaterThan(90)
    expect(highway.conditionDistanceM).toBeLessThan(110)
    expect(highway.brightness).toBeGreaterThan(100)
    expect(town).toMatchObject({ conditionId: null, autoLabel: null })

    // The stored image is the resized JPEG the row describes.
    const image = stored.get(highway.imageKey)
    expect(image?.byteLength).toBe(highway.bytes)
    expect(result.bytes).toBe(highway.bytes + town.bytes)
    const meta = await sharp(image!).metadata()
    expect([meta.format, meta.width]).toEqual(["jpeg", 512])
  })

  it("skips a camera whose photo hasn't changed (frozen feed)", async () => {
    const later = new Date(NOW.getTime() + 15 * 60_000)
    const result = await runCollection({
      db,
      storage,
      fetchImpl: fakeFetch,
      now: () => later,
    })
    expect(result).toMatchObject({ saved: 0, unchanged: 2, stale: 1 })
  })

  it("saves again once a camera has a new photo", async () => {
    const later = new Date(NOW.getTime() + 30 * 60_000)
    upstream[URLS.highway] = {
      bytes: await jpeg("#d1d5db"),
      at: later.getTime() - 30_000,
    }
    // Same bytes, recent timestamp: still unchanged, not stale.
    const town = upstream[URLS.town]
    if (town && town !== "down") town.at = later.getTime() - 60_000
    const result = await runCollection({
      db,
      storage,
      fetchImpl: fakeFetch,
      now: () => later,
    })
    expect(result).toMatchObject({ saved: 1, unchanged: 1 })
    expect(stored.size).toBe(3)
    // Each run is recorded for /api/health, even when nothing changed.
    const [run] = await db
      .select()
      .from(schema.syncState)
      .where(eq(schema.syncState.key, schema.COLLECT_RUN_KEY))
    expect(run?.at).toEqual(later)
  })
})

describe("label review", () => {
  it("lists, labels, counts and undoes", async () => {
    const all = parseReviewQuery({})
    const queue = await listForReview(all)
    expect(queue).toHaveLength(3)
    const newest = queue[0]!
    expect(newest.cameraName).toBe("alberta511:100-1")

    expect(await setHumanLabel(newest.id, "snow_covered")).toBe(true)
    expect(await listForReview(all)).toHaveLength(2)
    const done = await listForReview(parseReviewQuery({ show: "done" }))
    expect(done.map((d) => [d.id, d.humanLabel])).toEqual([
      [newest.id, "snow_covered"],
    ])

    const counts = await reviewCounts()
    expect(counts.total).toBe(3)
    expect(counts.reviewed).toBe(1)
    // Human label wins; the others keep their automatic labels.
    expect(counts.byLabel).toEqual({
      dry: 0,
      wet: 1,
      partly_snow: 0,
      snow_covered: 1,
      cant_see: 0,
      none: 1,
    })

    expect(await setHumanLabel(newest.id, "none")).toBe(true)
    expect((await reviewCounts()).byLabel.none).toBe(2)
    expect(await setHumanLabel(newest.id, null)).toBe(true)
    expect((await reviewCounts()).reviewed).toBe(0)
    expect(await setHumanLabel(999_999, "dry")).toBe(false)
  })

  it("filters by automatic label and pages by id", async () => {
    const wet = await listForReview(
      parseReviewQuery({ show: "all", auto: "wet" })
    )
    expect(wet.every((r) => r.autoLabel === "wet")).toBe(true)
    const none = await listForReview(
      parseReviewQuery({ show: "all", auto: "none" })
    )
    expect(none.map((r) => r.cameraId)).toEqual(["banff:bear"])

    const [first, ...rest] = await listForReview(
      parseReviewQuery({ show: "all" })
    )
    const older = await listForReview(
      parseReviewQuery({ show: "all", before: String(first!.id) })
    )
    expect(older.map((r) => r.id)).toEqual(rest.map((r) => r.id))
  })

  it("falls back on unexpected query values", () => {
    expect(
      parseReviewQuery({ show: "everything", auto: "ice", before: "1; drop" })
    ).toEqual({ filter: "todo", autoLabel: null, before: null })
    expect(parseReviewQuery({ show: ["all"], before: "12" })).toEqual({
      filter: "todo",
      autoLabel: null,
      before: 12,
    })
  })
})
