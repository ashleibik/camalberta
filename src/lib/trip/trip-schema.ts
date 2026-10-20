import { z } from "zod"

import { TRIP_IDS } from "./trips"

/** Route, query and body validation for trip ids (server side). */
export const tripIdSchema = z.enum(TRIP_IDS)
