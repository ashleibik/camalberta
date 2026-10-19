import "server-only"

import { and, eq } from "drizzle-orm"

import { getDb } from "@/lib/db"
import { pushSubscriptions, type PushSubscriptionRow } from "@/lib/db/schema"
import { computeTripVerdict } from "@/lib/trip/report"
import { loadTripData } from "@/lib/trip/store"
import { TRIP_IDS, type TripId } from "@/lib/trip/trips"

import {
  alertMessage,
  decideAlert,
  testMessage,
  type PushMessage,
} from "./policy"
import { isPushConfigured, sendPush, type SendResult } from "./send"

export interface AlertResult {
  status: "ok" | "skipped"
  sent: number
  /** Subscriptions deleted because the push service said they're gone. */
  removed: number
  failed: number
}

const empty = (status: AlertResult["status"]): AlertResult => ({
  status,
  sent: 0,
  removed: 0,
  failed: 0,
})

function whereRow(row: Pick<PushSubscriptionRow, "endpoint" | "trip">) {
  return and(
    eq(pushSubscriptions.endpoint, row.endpoint),
    eq(pushSubscriptions.trip, row.trip)
  )
}

async function deliver(
  row: PushSubscriptionRow,
  message: PushMessage,
  result: AlertResult
): Promise<SendResult> {
  const outcome = await sendPush(row, message)
  if (outcome === "ok") result.sent++
  else if (outcome === "failed") result.failed++
  else {
    await getDb().delete(pushSubscriptions).where(whereRow(row))
    result.removed++
  }
  return outcome
}

// Deliveries in flight at once.
const BATCH = 10

async function inBatches<T>(
  items: readonly T[],
  run: (item: T) => Promise<void>
) {
  for (let i = 0; i < items.length; i += BATCH) {
    await Promise.all(items.slice(i, i + BATCH).map(run))
  }
}

/**
 * After a sync: alert subscribers whose trip got worse (see decideAlert).
 * Trips we can't judge right now (stale or missing data) are skipped, so a
 * failed sync never sends anything.
 */
export async function sendTripAlerts(now = new Date()): Promise<AlertResult> {
  if (!isPushConfigured()) return empty("skipped")
  const db = getDb()
  const data = await loadTripData()
  const result = empty("ok")

  for (const trip of TRIP_IDS) {
    const verdict = computeTripVerdict(trip, data, now)
    if (verdict.level === "unknown") continue
    const current = verdict.level
    const rows = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.trip, trip))

    await inBatches(rows, async (row) => {
      const decision = decideAlert(row, current, now)
      if (decision === "set-baseline") {
        await db
          .update(pushSubscriptions)
          .set({ baseline: current })
          .where(whereRow(row))
      } else if (decision === "send") {
        const outcome = await deliver(row, alertMessage(trip, verdict), result)
        if (outcome === "ok") {
          await db
            .update(pushSubscriptions)
            .set({ baseline: current, lastNotifiedAt: now })
            .where(whereRow(row))
        }
      }
    })
  }
  return result
}

/** Send a test notification to every subscriber of one trip, or all trips. */
export async function sendTestAlerts(trip?: TripId): Promise<AlertResult> {
  if (!isPushConfigured()) return empty("skipped")
  const rows = await getDb()
    .select()
    .from(pushSubscriptions)
    .where(trip ? eq(pushSubscriptions.trip, trip) : undefined)
  const result = empty("ok")
  await inBatches(rows, async (row) => {
    await deliver(row, testMessage(row.trip), result)
  })
  return result
}
