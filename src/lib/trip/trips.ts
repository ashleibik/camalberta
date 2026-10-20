/**
 * The fixed Trip Check trips. Ids are what `/trip?to=` takes. Plain
 * TypeScript, safe for the browser bundle: the route geometry lives in
 * `routes.ts` and the Zod schema in `trip-schema.ts` (both server side).
 */
export const TRIP_IDS = ["canmore", "banff", "lake-louise", "edmonton"] as const
export type TripId = (typeof TRIP_IDS)[number]

export function isTripId(value: unknown): value is TripId {
  return (TRIP_IDS as readonly unknown[]).includes(value)
}

export const DEFAULT_TRIP: TripId = "banff"

export const TRIP_LABELS: Record<TripId, { short: string; name: string }> = {
  canmore: { short: "Canmore", name: "Calgary to Canmore" },
  banff: { short: "Banff", name: "Calgary to Banff" },
  "lake-louise": { short: "Lake Louise", name: "Calgary to Lake Louise" },
  edmonton: { short: "Edmonton", name: "Calgary to Edmonton" },
}

/** `?to=` value -> trip id; anything unknown falls back to the default. */
export function parseTripParam(value: string | null | undefined): TripId {
  return isTripId(value) ? value : DEFAULT_TRIP
}
