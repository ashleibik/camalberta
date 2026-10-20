import "server-only"

import {
  and,
  count,
  desc,
  eq,
  isNotNull,
  isNull,
  lt,
  sql,
  type SQL,
} from "drizzle-orm"

import { getDb } from "@/lib/db"
import { cameras, snapshots } from "@/lib/db/schema"

import { isRoadLabel, ROAD_LABELS, type RoadLabel } from "./labels"

/** The label review queue for /admin/label. */

export const REVIEW_FILTERS = ["todo", "done", "all"] as const
export type ReviewFilter = (typeof REVIEW_FILTERS)[number]
export const PAGE_SIZE = 24

export interface ReviewQuery {
  filter: ReviewFilter
  /** Only snapshots whose automatic label is this (or "none": no label). */
  autoLabel: RoadLabel | "none" | null
  /** Keyset paging: snapshots older than this id. */
  before: number | null
}

/** Parse the page's search params; anything unexpected falls back. */
export function parseReviewQuery(params: Record<string, unknown>): ReviewQuery {
  const filter = (REVIEW_FILTERS as readonly unknown[]).includes(params.show)
    ? (params.show as ReviewFilter)
    : "todo"
  const autoLabel =
    params.auto === "none"
      ? "none"
      : isRoadLabel(params.auto)
        ? params.auto
        : null
  const before =
    typeof params.before === "string" && /^\d{1,15}$/.test(params.before)
      ? Number(params.before)
      : null
  return { filter, autoLabel, before }
}

export interface ReviewItem {
  id: number
  cameraId: string
  cameraName: string | null
  takenAt: Date
  photoAt: Date | null
  brightness: number
  conditionRoadway: string | null
  conditionPrimary: string | null
  conditionSecondary: string[] | null
  conditionVisibility: string | null
  conditionDistanceM: number | null
  airTempC: number | null
  pavementTempC: number | null
  windKmh: number | null
  stationDistanceM: number | null
  autoLabel: RoadLabel | null
  autoLabelReason: string
  humanLabel: RoadLabel | null
  reviewedAt: Date | null
}

export async function listForReview(query: ReviewQuery): Promise<ReviewItem[]> {
  const where: SQL[] = []
  if (query.filter === "todo") where.push(isNull(snapshots.reviewedAt))
  if (query.filter === "done") where.push(isNotNull(snapshots.reviewedAt))
  if (query.autoLabel === "none") where.push(isNull(snapshots.autoLabel))
  else if (query.autoLabel) where.push(eq(snapshots.autoLabel, query.autoLabel))
  if (query.before !== null) where.push(lt(snapshots.id, query.before))

  return getDb()
    .select({
      id: snapshots.id,
      cameraId: snapshots.cameraId,
      cameraName: cameras.name,
      takenAt: snapshots.takenAt,
      photoAt: snapshots.photoAt,
      brightness: snapshots.brightness,
      conditionRoadway: snapshots.conditionRoadway,
      conditionPrimary: snapshots.conditionPrimary,
      conditionSecondary: snapshots.conditionSecondary,
      conditionVisibility: snapshots.conditionVisibility,
      conditionDistanceM: snapshots.conditionDistanceM,
      airTempC: snapshots.airTempC,
      pavementTempC: snapshots.pavementTempC,
      windKmh: snapshots.windKmh,
      stationDistanceM: snapshots.stationDistanceM,
      autoLabel: snapshots.autoLabel,
      autoLabelReason: snapshots.autoLabelReason,
      humanLabel: snapshots.humanLabel,
      reviewedAt: snapshots.reviewedAt,
    })
    .from(snapshots)
    .leftJoin(cameras, eq(cameras.id, snapshots.cameraId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(snapshots.id))
    .limit(PAGE_SIZE)
}

export interface ReviewCounts {
  total: number
  reviewed: number
  byLabel: Record<RoadLabel | "none", number>
}

/** Totals for the progress line: final label = human label, else automatic. */
export async function reviewCounts(): Promise<ReviewCounts> {
  const db = getDb()
  const [totals] = await db
    .select({
      total: count(),
      reviewed: count(snapshots.reviewedAt),
    })
    .from(snapshots)
  const rows = await db
    .select({
      label: sql<
        string | null
      >`case when ${snapshots.reviewedAt} is not null then ${snapshots.humanLabel} else ${snapshots.autoLabel} end`,
      n: count(),
    })
    .from(snapshots)
    .groupBy(sql`1`)
  const byLabel = Object.fromEntries(
    [...ROAD_LABELS, "none"].map((l) => [l, 0])
  ) as Record<RoadLabel | "none", number>
  for (const row of rows) {
    const key = isRoadLabel(row.label) ? row.label : "none"
    byLabel[key] += Number(row.n)
  }
  return {
    total: Number(totals?.total ?? 0),
    reviewed: Number(totals?.reviewed ?? 0),
    byLabel,
  }
}

/**
 * Record a human decision: a label, "none" (looked at it, no label fits), or
 * null to undo the review.
 */
export async function setHumanLabel(
  id: number,
  label: RoadLabel | "none" | null
): Promise<boolean> {
  const rows = await getDb()
    .update(snapshots)
    .set(
      label === null
        ? { humanLabel: null, reviewedAt: null }
        : {
            humanLabel: label === "none" ? null : label,
            reviewedAt: new Date(),
          }
    )
    .where(eq(snapshots.id, id))
    .returning({ id: snapshots.id })
  return rows.length > 0
}

export async function getSnapshotImageKey(id: number): Promise<string | null> {
  const [row] = await getDb()
    .select({ key: snapshots.imageKey })
    .from(snapshots)
    .where(eq(snapshots.id, id))
  return row?.key ?? null
}
