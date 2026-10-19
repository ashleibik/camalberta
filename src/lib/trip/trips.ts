import { z } from "zod"

/**
 * The fixed Trip Check trips. Ids are what `/trip?to=` takes. Safe to import
 * on the client: the route geometry lives in `routes.ts` (server side).
 */
export const TRIP_IDS = ["canmore", "banff", "lake-louise", "edmonton"] as const
export type TripId = (typeof TRIP_IDS)[number]

export const tripIdSchema = z.enum(TRIP_IDS)

export const DEFAULT_TRIP: TripId = "banff"

export const TRIP_LABELS: Record<TripId, { short: string; name: string }> = {
  canmore: { short: "Canmore", name: "Calgary to Canmore" },
  banff: { short: "Banff", name: "Calgary to Banff" },
  "lake-louise": { short: "Lake Louise", name: "Calgary to Lake Louise" },
  edmonton: { short: "Edmonton", name: "Calgary to Edmonton" },
}

/** `?to=` value -> trip id; anything unknown falls back to the default. */
export function parseTripParam(value: string | null | undefined): TripId {
  const parsed = tripIdSchema.safeParse(value)
  return parsed.success ? parsed.data : DEFAULT_TRIP
}
