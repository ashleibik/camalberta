import { classifyArea, type Area } from "@/lib/sources/areas"

import { locateOnLine } from "./geo"
import { ROUTES } from "./routes"

/**
 * Cameras this close to the Calgary to Edmonton route line, outside the
 * Calgary and Edmonton boxes, belong to the "qe2" area. Wider than Trip
 * Check's 500 m camera match so the area also includes cameras at the
 * interchanges.
 */
export const QE2_CORRIDOR_M = 1_000

export function isOnQe2Corridor(lat: number, lng: number): boolean {
  const position = locateOnLine(ROUTES.edmonton.line, [lng, lat])
  return position !== null && position.offsetM <= QE2_CORRIDOR_M
}

/** A camera's area: a box area, else the QEII corridor, else none. */
export function classifyCameraArea(lat: number, lng: number): Area | null {
  return classifyArea(lat, lng) ?? (isOnQe2Corridor(lat, lng) ? "qe2" : null)
}
