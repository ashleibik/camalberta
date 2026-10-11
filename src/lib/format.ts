import type { CameraSource, CameraStatus } from "@/lib/db/schema"

export const SOURCE_LABELS: Record<CameraSource, string> = {
  calgary: "City of Calgary",
  alberta511: "511 Alberta",
}

export const STATUS_LABELS: Record<CameraStatus, string> = {
  live: "Live",
  stale: "Stale",
  offline: "Offline",
}

export const AREA_LABELS: Record<string, string> = {
  calgary: "Calgary",
  bow_valley: "Bow Valley",
}

export function sourceLabel(source: CameraSource): string {
  return SOURCE_LABELS[source] ?? source
}

export function areaLabel(area: string): string {
  return AREA_LABELS[area] ?? area
}

/** Compact relative time, e.g. "just now", "3 min ago", "2 h ago". */
export function timeAgo(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "never"
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return "unknown"
  const seconds = Math.round((now - then) / 1000)
  if (seconds < 0) return "just now"
  if (seconds < 10) return "just now"
  if (seconds < 60) return `${seconds} sec ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} d ago`
}

/** Decimal degrees with a hemisphere letter, e.g. "51.0668° N". */
export function formatCoord(value: number, kind: "lat" | "lng"): string {
  const hemisphere =
    kind === "lat" ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W"
  return `${Math.abs(value).toFixed(4)}° ${hemisphere}`
}
