/**
 * Automatic road labels for collected snapshots: the official 511 Alberta
 * condition for the road in view, mapped to the five labels the model will
 * learn (Phase 10). Humans review and correct them on /admin/label.
 *
 * No separate ice class: ice isn't reliably visible in photos, so "Ice
 * Covered" counts as snow_covered and "Partly Covered Ice" as partly_snow
 * (the brief's call).
 */

export const ROAD_LABELS = [
  "dry",
  "wet",
  "partly_snow",
  "snow_covered",
  "cant_see",
] as const
export type RoadLabel = (typeof ROAD_LABELS)[number]

export function isRoadLabel(value: unknown): value is RoadLabel {
  return (ROAD_LABELS as readonly unknown[]).includes(value)
}

export const ROAD_LABEL_NAMES: Record<RoadLabel, string> = {
  dry: "Dry",
  wet: "Wet",
  partly_snow: "Partly snow",
  snow_covered: "Snow covered",
  cant_see: "Can't see",
}

/**
 * Brightness (mean grey, 0 to 255) outside this range means the road can't
 * be judged from the photo. Measured on Bow Valley cameras at 9 PM in
 * October: truly dark frames were 21 to 44, infrared night views (road
 * visible) 74 to 98, and a white "image unavailable" card 245. Kept
 * conservative; borderline frames get 511's label and a human checks them.
 */
export const TOO_DARK_BELOW = 30
export const WASHED_OUT_ABOVE = 235

/** A 511 condition counts for a camera within this distance of the road. */
export const CONDITION_MAX_DISTANCE_M = 300

interface Rule {
  match: RegExp
  label: RoadLabel | null
}

/**
 * 511 "Primary Condition" -> label, first match wins. Seen values: "Bare
 * Dry", "Bare Wet", "Closed", "No Report"; the winter ones follow 511's
 * definitions (https://511.alberta.ca/about/definitions) and match by keyword
 * (see src/lib/trip/config.ts for the same caveat).
 */
const PRIMARY_RULES: readonly Rule[] = [
  { match: /^bare dry$/i, label: "dry" },
  { match: /^bare wet$/i, label: "wet" },
  // "Partly Covered Snow", "Partly Covered Ice", "Partly Snow Covered"...
  { match: /partly/i, label: "partly_snow" },
  // "Covered Snow", "Snow Covered", "Ice Covered", "Snow Packed"...
  { match: /covered|packed/i, label: "snow_covered" },
  // Closed, Travel Not Recommended, No Report: the surface isn't stated, so
  // no automatic label; a human decides from the photo.
]

export interface LabelFacts {
  /** Mean brightness of the resized photo. */
  brightness: number
  /** The nearest 511 condition, or null when none is close enough. */
  condition: {
    primary: string
    secondary: readonly string[]
    visibility: string | null
  } | null
}

export interface AutoLabel {
  label: RoadLabel | null
  /** Why, in plain words, shown on the label page. */
  reason: string
}

export function autoLabel(facts: LabelFacts): AutoLabel {
  const brightness = Math.round(facts.brightness)
  if (facts.brightness < TOO_DARK_BELOW) {
    return { label: "cant_see", reason: `Too dark (brightness ${brightness})` }
  }
  if (facts.brightness > WASHED_OUT_ABOVE) {
    return {
      label: "cant_see",
      reason: `Washed out or no image (brightness ${brightness})`,
    }
  }
  if (!facts.condition) {
    return { label: null, reason: "No 511 road condition near this camera" }
  }
  const { primary, secondary, visibility } = facts.condition
  if (visibility && /^poor$/i.test(visibility.trim())) {
    return { label: "cant_see", reason: `511 visibility "${visibility}"` }
  }
  const rule = PRIMARY_RULES.find((r) => r.match.test(primary.trim()))
  if (!rule) {
    return {
      label: null,
      reason: `511 "${primary}" doesn't describe the surface`,
    }
  }
  // Bare roads with snow outside the wheel paths are partly snow covered.
  if (
    (rule.label === "dry" || rule.label === "wet") &&
    secondary.some((s) => /bare wheel paths/i.test(s))
  ) {
    return {
      label: "partly_snow",
      reason: `511 "${primary}" with "Bare Wheel Paths"`,
    }
  }
  return { label: rule.label, reason: `511 "${primary}"` }
}
