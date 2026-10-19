import {
  EVENT_LOOKAHEAD_MS,
  EVENT_RULES,
  EVENT_TYPE_LABELS,
  PRIMARY_CONDITION_RULES,
  SECONDARY_CONDITION_RULES,
  STALE_AFTER_MS,
  VISIBILITY_RULES,
  type EventFacts,
  type Level,
  type RuleLevel,
  type ValueRule,
} from "./config"

/**
 * The Trip Check verdict: rule based and explainable. Every yellow or red
 * comes with the reason that caused it. The rules themselves live in
 * config.ts.
 */

export type VerdictLevel = Level | "unknown"

export const VERDICT_LABELS: Record<VerdictLevel, string> = {
  red: "Check before you go",
  yellow: "Drive carefully",
  green: "Looks good",
  unknown: "Can't confirm",
}

const RANK: Record<RuleLevel, number> = { info: 0, green: 0, yellow: 1, red: 2 }

export function isWorse(next: Level, previous: Level): boolean {
  return RANK[next] > RANK[previous]
}

/** The worst of some levels ("info" counts as green). */
export function worstLevel(levels: Iterable<RuleLevel>): Level {
  let worst: Level = "green"
  for (const level of levels) {
    if (RANK[level] > RANK[worst]) worst = level === "info" ? "green" : level
  }
  return worst
}

/** One thing 511 reports, and what it means for the trip. */
export interface Finding {
  level: RuleLevel
  text: string
  /** False when no rule recognized the value (it then counts as yellow). */
  known: boolean
}

/** "Bare Wheel Paths" -> "Bare wheel paths". */
export function sentenceCase(value: string): string {
  const clean = value.trim().replace(/\s+/g, " ")
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase()
}

/** "bridgeMaintenance" -> "Bridge maintenance"; "Sensor Installation" too. */
export function humanize(value: string): string {
  return sentenceCase(value.replace(/([a-z])([A-Z])/g, "$1 $2"))
}

function applyRules(value: string, rules: readonly ValueRule[]): Finding {
  const clean = value.trim().replace(/\s+/g, " ")
  const rule = rules.find((r) => r.match.test(clean))
  if (!rule) return { level: "yellow", text: sentenceCase(clean), known: false }
  return {
    level: rule.level,
    text: rule.label ?? sentenceCase(clean),
    known: true,
  }
}

export interface ConditionFacts {
  primary: string
  secondary: readonly string[]
  visibility: string | null
}

/** Everything one road condition segment reports, each with its level. */
export function classifyCondition(segment: ConditionFacts): Finding[] {
  const findings = [applyRules(segment.primary, PRIMARY_CONDITION_RULES)]
  for (const value of segment.secondary) {
    if (value.trim())
      findings.push(applyRules(value, SECONDARY_CONDITION_RULES))
  }
  if (segment.visibility?.trim()) {
    const finding = applyRules(segment.visibility, VISIBILITY_RULES)
    findings.push({ ...finding, text: `${finding.text} visibility` })
  }
  return findings
}

/** The reason text for an event when no rule gives a fixed label. */
export function eventLabel(
  event: Pick<EventFacts, "type" | "subType">
): string {
  const sub = event.subType.trim()
  if (sub && !/^general$/i.test(sub)) return humanize(sub)
  return EVENT_TYPE_LABELS[event.type] ?? "Traffic event"
}

export function classifyEvent(event: EventFacts): Finding {
  const rule = EVENT_RULES.find((r) => r.when(event))
  if (!rule) return { level: "yellow", text: eventLabel(event), known: false }
  return {
    level: rule.level,
    text: rule.label ?? eventLabel(event),
    known: true,
  }
}

/** Whether an event matters for a trip today: active now or starting soon. */
export function isEventRelevant(
  event: { startsAt: Date; endsAt: Date | null },
  now: Date
): boolean {
  if (event.startsAt.getTime() > now.getTime() + EVENT_LOOKAHEAD_MS)
    return false
  return event.endsAt === null || event.endsAt.getTime() > now.getTime()
}

export interface Reason {
  level: Exclude<Level, "green">
  text: string
  /** Where on the route, from Calgary. */
  km: number
  kind: "condition" | "event"
}

export interface VerdictInput {
  segments: ReadonlyArray<ConditionFacts & { fromKm: number; toKm: number }>
  events: ReadonlyArray<
    EventFacts & { km: number; startsAt: Date; endsAt: Date | null }
  >
  /** When our road data was last refreshed from 511 (null: never). */
  dataUpdatedAt: Date | null
  now: Date
  /** The named place nearest a point on the route. */
  placeAt: (km: number) => string
}

export interface Verdict {
  level: VerdictLevel
  label: string
  /** Yellow and red reasons, worst first, then in driving order. */
  reasons: Reason[]
  /** Our data is older than STALE_AFTER_MS. */
  stale: boolean
  /** We have no road condition data for this route. */
  noData: boolean
}

export function computeVerdict(input: VerdictInput): Verdict {
  const reasons: Reason[] = []
  const seen = new Set<string>()
  const add = (reason: Reason) => {
    const key = `${reason.level}|${reason.text}`
    if (seen.has(key)) return
    seen.add(key)
    reasons.push(reason)
  }

  for (const segment of input.segments) {
    const km = (segment.fromKm + segment.toKm) / 2
    for (const finding of classifyCondition(segment)) {
      if (finding.level !== "yellow" && finding.level !== "red") continue
      add({
        level: finding.level,
        text: `${finding.text} near ${input.placeAt(km)}`,
        km,
        kind: "condition",
      })
    }
  }

  for (const event of input.events) {
    if (!isEventRelevant(event, input.now)) continue
    const finding = classifyEvent(event)
    if (finding.level !== "yellow" && finding.level !== "red") continue
    add({
      level: finding.level,
      text: `${finding.text} near ${input.placeAt(event.km)}`,
      km: event.km,
      kind: "event",
    })
  }

  reasons.sort((a, b) => RANK[b.level] - RANK[a.level] || a.km - b.km)

  const noData = input.dataUpdatedAt === null || input.segments.length === 0
  const stale =
    input.dataUpdatedAt !== null &&
    input.now.getTime() - input.dataUpdatedAt.getTime() > STALE_AFTER_MS

  let level: VerdictLevel = worstLevel(reasons.map((r) => r.level))
  // Never claim "Looks good" on old or missing data. Yellow and red stand:
  // a known problem is still worth showing.
  if (level === "green" && (stale || noData)) level = "unknown"

  return { level, label: VERDICT_LABELS[level], reasons, stale, noData }
}
