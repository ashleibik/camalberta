import { z } from "zod"

import { MATCH_DISTANCE_M } from "./config"
import { prepareLine, type PreparedLine } from "./geo"
import routesJson from "./routes.json"
import { TRIP_IDS, tripIdSchema, type TripId } from "./trips"

/**
 * The four trip routes, from `routes.json` (GeoJSON built from OpenStreetMap
 * data by scripts/build-trip-routes.mjs). Validated when this module loads,
 * so a bad edit fails tests and the build, not a request.
 */

const placeSchema = z.object({
  name: z.string().min(1),
  km: z.number().min(0),
})

const routeFeatureSchema = z.object({
  type: z.literal("Feature"),
  properties: z.object({
    id: tripIdSchema,
    name: z.string().min(1),
    highway: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
    places: z.array(placeSchema).min(1),
  }),
  geometry: z.object({
    type: z.literal("LineString"),
    coordinates: z
      .array(
        z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
      )
      .min(2),
  }),
})

const routesSchema = z.object({
  type: z.literal("FeatureCollection"),
  attribution: z.string(),
  features: z.array(routeFeatureSchema),
})

export interface Place {
  name: string
  /** Distance from the start of the route. */
  km: number
}

export interface TripRoute {
  id: TripId
  name: string
  highway: string
  from: string
  to: string
  places: readonly Place[]
  line: PreparedLine
}

// The index must answer the largest distance any matcher asks about.
const MAX_QUERY_M = Math.max(...Object.values(MATCH_DISTANCE_M))

const parsed = routesSchema.parse(routesJson)

function loadRoutes(): Record<TripId, TripRoute> {
  const byId = new Map(parsed.features.map((f) => [f.properties.id, f]))
  const out = {} as Record<TripId, TripRoute>
  for (const id of TRIP_IDS) {
    const feature = byId.get(id)
    if (!feature) throw new Error(`routes.json is missing the ${id} route`)
    const { properties, geometry } = feature
    out[id] = {
      id,
      name: properties.name,
      highway: properties.highway,
      from: properties.from,
      to: properties.to,
      places: [...properties.places].sort((a, b) => a.km - b.km),
      line: prepareLine(geometry.coordinates, MAX_QUERY_M),
    }
  }
  return out
}

export const ROUTES: Readonly<Record<TripId, TripRoute>> = loadRoutes()

export const ROUTE_ATTRIBUTION = parsed.attribution

/** The named place closest to a point on the route (by distance along it). */
export function nearestPlace(route: TripRoute, km: number): string {
  let best = route.places[0]!
  for (const place of route.places) {
    if (Math.abs(place.km - km) < Math.abs(best.km - km)) best = place
  }
  return best.name
}
