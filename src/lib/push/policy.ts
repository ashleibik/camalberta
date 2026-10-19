import type { TripLevel } from "@/lib/db/schema"
import { VERDICT_LABELS, isWorse, type Verdict } from "@/lib/trip/verdict"
import { TRIP_LABELS, type TripId } from "@/lib/trip/trips"

/** At most one alert per trip per subscriber in this window. */
export const ALERT_COOLDOWN_MS = 60 * 60_000

export type AlertDecision =
  /** Send an alert, then store `current` as the new baseline. */
  | "send"
  /** Store `current` as the baseline without alerting (first look, or better). */
  | "set-baseline"
  | "none"

/**
 * Whether a subscriber should hear about a trip's current verdict.
 *
 * `baseline` is the verdict they were last told about (or saw when they
 * subscribed). They get an alert when the trip is worse than that (green to
 * yellow, yellow to red, green to red), at most once an hour. If it gets worse
 * again within the hour, the alert waits: the baseline isn't moved, so the
 * first sync after the hour sends it if the trip is still worse. When the trip
 * improves the baseline quietly follows, so a later worsening alerts again.
 */
export function decideAlert(
  subscriber: { baseline: TripLevel | null; lastNotifiedAt: Date | null },
  current: TripLevel,
  now: Date
): AlertDecision {
  const { baseline, lastNotifiedAt } = subscriber
  if (baseline === null) return "set-baseline"
  if (isWorse(current, baseline)) {
    const coolingDown =
      lastNotifiedAt !== null &&
      now.getTime() - lastNotifiedAt.getTime() < ALERT_COOLDOWN_MS
    return coolingDown ? "none" : "send"
  }
  if (isWorse(baseline, current)) return "set-baseline"
  return "none"
}

/** What the service worker shows. Plain text only. */
export interface PushMessage {
  title: string
  body: string
  /** Same-origin path opened when the notification is tapped. */
  url: string
  /** Replaces an older notification for the same trip. */
  tag: string
}

export function alertMessage(trip: TripId, verdict: Verdict): PushMessage {
  const level = verdict.level === "unknown" ? "unknown" : verdict.level
  return {
    title: `${TRIP_LABELS[trip].name}: ${VERDICT_LABELS[level]}`,
    body: verdict.reasons[0]?.text ?? "Conditions on your trip changed.",
    url: `/trip?to=${trip}`,
    tag: `trip-${trip}`,
  }
}

export function testMessage(trip: TripId): PushMessage {
  return {
    title: `Test alert: ${TRIP_LABELS[trip].name}`,
    body: "Alerts work. You'll hear from us only if this trip gets worse.",
    url: `/trip?to=${trip}`,
    tag: `trip-${trip}`,
  }
}
