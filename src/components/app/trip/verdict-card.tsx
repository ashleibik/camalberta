"use client"

import {
  CircleCheck,
  CircleHelp,
  Info,
  OctagonAlert,
  TriangleAlert,
} from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { TripReport, TripVerdictLevel } from "@/lib/api-types"
import { useNow } from "@/lib/client/use-now"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"

import { VERDICT_STYLES } from "./levels"

const ICONS: Record<TripVerdictLevel, typeof CircleCheck> = {
  green: CircleCheck,
  yellow: TriangleAlert,
  red: OctagonAlert,
  unknown: CircleHelp,
}

// Reasons shown before "Show all".
const FIRST_REASONS = 3

// The card and its skeleton share a minimum height (a typical card with
// three reasons), so loading or switching trips doesn't push the page down.
const CARD_MIN_HEIGHT = "min-h-[15.5rem]"

export const ALBERTA_511_URL = "https://511.alberta.ca/"

export function Disclaimer() {
  return (
    <p className="flex gap-2 text-xs text-muted-foreground">
      <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span>
        This is a guide, not a safety guarantee. Always check{" "}
        <a
          href={ALBERTA_511_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground underline underline-offset-2"
        >
          official 511 Alberta
        </a>{" "}
        before you travel.
      </span>
    </p>
  )
}

function summary(report: TripReport): string {
  const { verdict } = report
  if (verdict.noData) return "No road reports from 511 Alberta yet."
  if (verdict.level === "unknown") {
    return "Our road data is too old to say it looks good."
  }
  if (verdict.reasons.length === 0) {
    return "No closures, construction or winter conditions reported on this route."
  }
  return `${verdict.reasons.length} ${verdict.reasons.length === 1 ? "thing" : "things"} to know on this route:`
}

export function VerdictCard({ report }: { report: TripReport }) {
  const { verdict, trip } = report
  const now = useNow(30_000)
  const [showAll, setShowAll] = useState(false)
  const style = VERDICT_STYLES[verdict.level]
  const Icon = ICONS[verdict.level]
  const reasons = showAll
    ? verdict.reasons
    : verdict.reasons.slice(0, FIRST_REASONS)

  return (
    <section
      aria-labelledby="verdict-label"
      aria-live="polite"
      data-testid="verdict-card"
      data-level={verdict.level}
      className={cn(
        "flex flex-col rounded-xl border-2 p-4 sm:p-5",
        CARD_MIN_HEIGHT,
        style.card
      )}
    >
      <div className="flex items-start gap-3">
        <Icon
          className={cn("mt-0.5 size-8 shrink-0", style.icon)}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h2
            id="verdict-label"
            className="text-2xl leading-tight font-semibold tracking-tight"
          >
            {verdict.label}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {trip.name} · {trip.highway} ·{" "}
            <span className="font-mono">{Math.round(trip.lengthKm)} km</span>
          </p>
        </div>
      </div>

      {verdict.stale && !verdict.noData && (
        <p
          role="alert"
          className="mt-3 flex items-center gap-2 rounded-lg bg-status-stale/15 px-3 py-2 text-sm font-medium"
        >
          <TriangleAlert
            className="size-4 shrink-0 text-status-stale"
            aria-hidden="true"
          />
          Data may be out of date.
        </p>
      )}

      <p className="mt-3 text-sm">{summary(report)}</p>
      {reasons.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {reasons.map((reason) => (
            <li
              key={`${reason.level}-${reason.text}`}
              className="flex items-start gap-2 text-sm"
            >
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  VERDICT_STYLES[reason.level].dot
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">{reason.text}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                km {Math.round(reason.km)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {verdict.reasons.length > FIRST_REASONS && (
        <Button
          variant="link"
          size="sm"
          className="mt-1 h-auto px-0"
          aria-expanded={showAll}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Show fewer" : `Show all ${verdict.reasons.length}`}
        </Button>
      )}

      <p className="mt-auto pt-3 text-xs text-muted-foreground">
        Updated{" "}
        <span className="font-mono">
          {now === null ? "…" : timeAgo(report.dataUpdatedAt, now)}
        </span>{" "}
        from 511 Alberta
      </p>
    </section>
  )
}

export function VerdictSkeleton() {
  return (
    <div
      className={cn("rounded-xl border-2 p-4 sm:p-5", CARD_MIN_HEIGHT)}
      aria-busy="true"
    >
      <div className="flex items-center gap-3">
        <Skeleton className="size-8 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    </div>
  )
}
