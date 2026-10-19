import type {
  RoadCondition,
  RoadEvent,
  WeatherStation,
} from "@/lib/sources/alberta511-trip"

import { matchEvents, matchSegment, matchStations } from "./matching"
import { ROUTES } from "./routes"
import { classifyCondition, classifyEvent } from "./verdict"

/**
 * What the sync keeps from 511's province-wide feeds: only what lies along at
 * least one trip route, using the same rules as the trip page.
 */

const routes = Object.values(ROUTES)

export function conditionsNearRoutes(
  conditions: readonly RoadCondition[]
): RoadCondition[] {
  return conditions.filter((c) => routes.some((r) => matchSegment(r, c.path)))
}

export function eventsNearRoutes(events: readonly RoadEvent[]): RoadEvent[] {
  return events.filter((e) =>
    routes.some((r) => matchEvents(r, [e]).length > 0)
  )
}

export function stationsNearRoutes(
  stations: readonly WeatherStation[]
): WeatherStation[] {
  return stations.filter((s) =>
    routes.some((r) => matchStations(r, [s]).length > 0)
  )
}

/**
 * 511 values no rule in config.ts recognizes (they count as yellow). The sync
 * logs these so the rules can be extended.
 */
export function unrecognizedValues(
  conditions: readonly RoadCondition[],
  events: readonly RoadEvent[]
): string[] {
  const values = new Set<string>()
  for (const c of conditions) {
    const findings = classifyCondition({
      primary: c.primaryCondition,
      secondary: c.secondaryConditions,
      visibility: c.visibility,
    })
    for (const f of findings) if (!f.known) values.add(`condition "${f.text}"`)
  }
  for (const e of events) {
    const finding = classifyEvent({
      type: e.eventType,
      subType: e.eventSubType,
      severity: e.severity,
      fullClosure: e.fullClosure,
      lanesAffected: e.lanesAffected ?? "",
      description: e.description,
    })
    if (!finding.known) values.add(`event type "${e.eventType}"`)
  }
  return [...values].sort()
}
