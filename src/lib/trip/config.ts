/**
 * Trip Check rules, all in one place: how close things must be to count as
 * "on the route", how old our data may get, and which 511 Alberta values make
 * a trip GREEN, YELLOW or RED. Change the rules here; `verdict.ts` only
 * applies them.
 *
 * Where the values come from:
 * - "seen": appeared in real 511 responses (fixtures saved 2026-10-19 in
 *   src/lib/sources/__fixtures__/alberta511-*.json).
 * - "511 definition": 511 Alberta's official road condition vocabulary
 *   (https://511.alberta.ca/about/definitions), not yet seen in a response
 *   because there was no snow on the routes when the fixtures were saved.
 *   These match by keyword, since the exact API spelling is unconfirmed.
 *
 * Anything that matches no rule counts as YELLOW (never green), and the sync
 * logs it so it can be added here.
 */

export type Level = "green" | "yellow" | "red"
/** "info" items are listed on the page but never change the verdict. */
export type RuleLevel = Level | "info"

// ---------------------------------------------------------------------------
// Matching: what counts as "on the route"
// ---------------------------------------------------------------------------

export const MATCH_DISTANCE_M = {
  /** Cameras within this distance of the route line. */
  camera: 500,
  /** Events (their reported point) within this distance of the route line. */
  event: 500,
  /**
   * Road condition segments describe the highway itself, so they must lie on
   * the line: at least SEGMENT_MIN_SHARE of their length within 150 m. With
   * 500 m, Highway 2A (which runs right beside the QEII near Lacombe) and
   * crossing roads at interchanges were pulled in.
   */
  segment: 150,
  /** Weather stations within this distance of the route line. */
  station: 2_000,
} as const

/**
 * Share of a road segment's length (its best line) that must lie within the
 * segment distance of the route. Measured on the 2026-10-19 data at 150 m:
 * every Highway 1 and QEII segment scored 0.64 to 1.00, except Hwy 2 "Edmonton
 * City Limit to 19 Avenue NW" at 0.45 (it runs on past the route's end at the
 * Henday). Highway 2A and crossing roads scored 0.26 at most.
 */
export const SEGMENT_MIN_SHARE = 0.4

/**
 * A segment shows weather from the nearest station on the route, if one is
 * within this many km of it. Stations are sparse: on Highway 1 there are none
 * inside Banff National Park.
 */
export const WEATHER_MAX_GAP_KM = 25

// ---------------------------------------------------------------------------
// Freshness and timing
// ---------------------------------------------------------------------------

/** Older data shows "Data may be out of date" and never shows green. */
export const STALE_AFTER_MS = 30 * 60_000

/**
 * Events count while active, and from this long before they start (planned
 * work later today still matters for a trip today). 511 lists many events
 * that start weeks from now; those are ignored.
 */
export const EVENT_LOOKAHEAD_MS = 12 * 60 * 60_000

// ---------------------------------------------------------------------------
// Road conditions (511 "Road Conditions" / winterroads)
// ---------------------------------------------------------------------------

export interface ValueRule {
  match: RegExp
  level: RuleLevel
  /** Reason text; otherwise 511's own wording, in sentence case. */
  label?: string
}

/**
 * "Primary Condition": the road surface. First matching rule wins.
 * Seen: "Bare Dry", "Bare Wet", "Closed", "No Report".
 */
export const PRIMARY_CONDITION_RULES: readonly ValueRule[] = [
  // Seen. Closed to traffic.
  { match: /^closed$/i, level: "red", label: "Road closed" },
  // 511 definition: "Travel Not Recommended": unsuitable for non-essential
  // travel; may be impassable.
  { match: /not recommended/i, level: "red" },
  // Seen. Clear of snow and ice (wet is normal driving).
  { match: /^bare (dry|wet)$/i, level: "green" },
  // Seen. 511: "A roadway with no report available does not indicate normal
  // driving conditions; adverse driving conditions may be present." So it
  // can't count as good.
  { match: /^no report$/i, level: "yellow", label: "No condition report" },
  // 511 definition: "Partly Covered (Snow/Ice)" and "Covered (Snow/Ice)",
  // matched by keyword whatever the exact wording.
  { match: /covered|snow|ice|icy|slush|packed/i, level: "yellow" },
]

/**
 * "Secondary Conditions": extra hazards on a segment (a list). First matching
 * rule wins. Seen: "Bare Wheel Paths", "Strong Wind", "Rain", "Frost",
 * "Fog Patches".
 */
export const SECONDARY_CONDITION_RULES: readonly ValueRule[] = [
  // Seen. Wet road; normal care, not a warning on its own.
  { match: /^rain$/i, level: "info" },
  // Seen. Snow or ice outside the wheel paths.
  { match: /^bare wheel paths$/i, level: "yellow" },
  // Seen. Icy patches.
  { match: /^frost$/i, level: "yellow" },
  // Seen. Poor visibility in places.
  { match: /^fog patches$/i, level: "yellow" },
  // Seen. Not in the brief's list, but 511 reports it as a road condition and
  // it's a real hazard on open highway (high-sided vehicles, blowing snow).
  // Change to "info" to ignore wind.
  { match: /^strong wind$/i, level: "yellow" },
  // Not seen yet: blowing or drifting snow, freezing rain, ice, smoke...
  {
    match:
      /snow|ice|icy|freez|slush|slippery|drift|blowing|fog|smoke|visib|wind/i,
    level: "yellow",
  },
]

/**
 * "Visibility". Seen: "Good" (or empty). 511 definitions: Good is over 500 m,
 * Fair 250 to 500 m, Poor under 250 m.
 */
export const VISIBILITY_RULES: readonly ValueRule[] = [
  { match: /^good$/i, level: "green" },
  { match: /^(fair|poor)$/i, level: "yellow" },
]

// ---------------------------------------------------------------------------
// Events (511 "Events": closures, collisions, construction...)
// ---------------------------------------------------------------------------

/** The event fields the rules look at. */
export interface EventFacts {
  type: string
  subType: string
  severity: string
  fullClosure: boolean
  lanesAffected: string
  description: string
}

export interface EventRule {
  when: (event: EventFacts) => boolean
  level: RuleLevel
  /** Fixed reason text; otherwise the event's own subtype, humanized. */
  label?: string
}

/**
 * First matching rule wins. Seen EventType values: "roadwork",
 * "restrictionClass", "generalInfo", "accidentsAndIncidents", "closures"
 * (511's docs also list "specialEvents"). Seen Severity: "None", "Major".
 */
export const EVENT_RULES: readonly EventRule[] = [
  // Seen (IsFullClosure: true). All lanes blocked.
  { when: (e) => e.fullClosure, level: "red", label: "Road closed" },
  // Seen ("All lanes closed").
  {
    when: (e) => /all lanes closed/i.test(e.lanesAffected),
    level: "red",
    label: "Road closed",
  },
  // Seen. 511: "Major closure that may significantly impact travellers".
  { when: (e) => e.type === "closures", level: "red", label: "Closure" },
  // Seen. 511's severity scale tops out at Major.
  { when: (e) => /^major$/i.test(e.severity), level: "red" },
  // Avalanche control means planned full stops on mountain highways, often
  // for an hour or more.
  {
    when: (e) =>
      /avalanche/i.test(e.subType) || /avalanche/i.test(e.description),
    level: "red",
    label: "Avalanche control",
  },
  // Seen ("wideLoadReport", "Weight restriction"): over-dimensional loads and
  // truck limits. Listed, but they don't affect a car trip.
  { when: (e) => e.type === "restrictionClass", level: "info" },
  // Seen. Construction, bridge work, paving: slow down, lane closures.
  { when: (e) => e.type === "roadwork", level: "yellow" },
  // Seen. Collisions and incidents that aren't closures or Major.
  { when: (e) => e.type === "accidentsAndIncidents", level: "yellow" },
  // Seen. Advisories ("trafficAdvisory", "general").
  { when: (e) => e.type === "generalInfo", level: "yellow" },
  // 511 docs: parades, marathons and other events on the road.
  { when: (e) => e.type === "specialEvents", level: "yellow" },
]

/** Reason text for an event whose subtype is generic ("general", empty). */
export const EVENT_TYPE_LABELS: Record<string, string> = {
  roadwork: "Roadwork",
  accidentsAndIncidents: "Incident",
  generalInfo: "Traffic advisory",
  closures: "Closure",
  specialEvents: "Special event",
  restrictionClass: "Restriction",
}
