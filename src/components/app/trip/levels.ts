import type { TripRuleLevel, TripVerdictLevel } from "@/lib/api-types"

/**
 * Verdict colours reuse the status tokens from globals.css: green = live,
 * amber = stale, red = offline. Text stays the normal foreground colour for
 * contrast; colour is carried by the icon, the edge and the dot.
 */
export const VERDICT_STYLES: Record<
  TripVerdictLevel,
  { card: string; icon: string; dot: string }
> = {
  green: {
    card: "border-status-live/50 bg-status-live/10",
    icon: "text-status-live",
    dot: "bg-status-live",
  },
  yellow: {
    card: "border-status-stale/60 bg-status-stale/10",
    icon: "text-status-stale",
    dot: "bg-status-stale",
  },
  red: {
    card: "border-status-offline/60 bg-status-offline/10",
    icon: "text-status-offline",
    dot: "bg-status-offline",
  },
  unknown: {
    card: "border-border bg-muted/50",
    icon: "text-muted-foreground",
    dot: "bg-muted-foreground",
  },
}

export const RULE_DOT: Record<TripRuleLevel, string> = {
  green: "bg-status-live",
  yellow: "bg-status-stale",
  red: "bg-status-offline",
  info: "bg-muted-foreground",
}

/** Map colours (hex, for MapLibre). Match the status tokens. */
export const LEVEL_HEX: Record<TripRuleLevel, string> = {
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  info: "#a1a1aa",
}
