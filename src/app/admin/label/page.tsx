import type { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { Suspense } from "react"

import { SkipLink } from "@/components/app/skip-link"
import { Brand } from "@/components/shell/brand"
import { ThemeToggle } from "@/components/theme-toggle"
import { isAdminAuthorized, isAdminEnabled } from "@/lib/auth"
import { ROAD_LABEL_NAMES, ROAD_LABELS } from "@/lib/collect/labels"
import {
  listForReview,
  PAGE_SIZE,
  parseReviewQuery,
  reviewCounts,
  type ReviewItem,
  type ReviewQuery,
} from "@/lib/collect/review"
import { cn } from "@/lib/utils"

import { LabelCard, type LabelCardData } from "./label-card"

export const metadata: Metadata = {
  title: "Label snapshots",
  robots: { index: false, follow: false },
}

const timeFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Edmonton",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

function minutes(ms: number): string {
  const m = Math.round(ms / 60_000)
  return m < 1 ? "just taken" : `${m} min old`
}

function toCard(item: ReviewItem): LabelCardData {
  const condition = item.conditionPrimary
    ? [
        item.conditionRoadway,
        item.conditionPrimary,
        ...(item.conditionSecondary ?? []),
        item.conditionVisibility && `${item.conditionVisibility} visibility`,
      ]
        .filter(Boolean)
        .join(" · ") +
      (item.conditionDistanceM !== null
        ? ` (${Math.round(item.conditionDistanceM)} m away)`
        : "")
    : "no condition reported nearby"
  const weather =
    item.airTempC !== null || item.windKmh !== null
      ? [
          item.airTempC !== null && `${Math.round(item.airTempC)}°C air`,
          item.pavementTempC !== null &&
            `${Math.round(item.pavementTempC)}°C road`,
          item.windKmh !== null && `${Math.round(item.windKmh)} km/h wind`,
          item.stationDistanceM !== null &&
            `station ${(item.stationDistanceM / 1000).toFixed(1)} km away`,
        ]
          .filter(Boolean)
          .join(" · ")
      : null
  return {
    id: item.id,
    camera: item.cameraName ?? item.cameraId,
    takenAt: timeFormat.format(item.takenAt),
    photoAge: item.photoAt
      ? minutes(item.takenAt.getTime() - item.photoAt.getTime())
      : null,
    condition,
    weather,
    autoLabel: item.autoLabel,
    autoLabelReason: item.autoLabelReason,
    humanLabel: item.humanLabel,
    reviewed: item.reviewedAt !== null,
  }
}

function href(query: ReviewQuery, change: Partial<ReviewQuery>): string {
  const next = { ...query, before: null, ...change }
  const params = new URLSearchParams()
  if (next.filter !== "todo") params.set("show", next.filter)
  if (next.autoLabel) params.set("auto", next.autoLabel)
  if (next.before !== null) params.set("before", String(next.before))
  const search = params.toString()
  return search ? `/admin/label?${search}` : "/admin/label"
}

function FilterLink({
  active,
  to,
  children,
}: {
  active: boolean
  to: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={to}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-md px-2 py-1 text-xs font-medium",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </Link>
  )
}

async function Board({
  searchParams,
}: {
  searchParams: PageProps<"/admin/label">["searchParams"]
}) {
  // Everything below runs only for a real request: never while Next
  // prerenders (the env flag would be read at build time and a 404 baked
  // in) nor in a runtime prefetch (the uncached database reads below use the
  // clock, which Next reports as an error there).
  await connection()
  // The proxy already checks these; check again here.
  const authorization = (await headers()).get("authorization")
  if (!isAdminEnabled()) notFound()
  if (!(await isAdminAuthorized(authorization))) {
    return <p className="text-sm">Sign-in required.</p>
  }
  const query = parseReviewQuery(await searchParams)
  const [items, counts] = await Promise.all([
    listForReview(query),
    reviewCounts(),
  ])

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm">
          <span className="font-mono">{counts.reviewed}</span> of{" "}
          <span className="font-mono">{counts.total}</span> snapshots reviewed.
          Labels so far:{" "}
          {[...ROAD_LABELS, "none" as const].map((label, i) => (
            <span key={label}>
              {i > 0 && " · "}
              {label === "none" ? "no label" : ROAD_LABEL_NAMES[label]}{" "}
              <span className="font-mono">{counts.byLabel[label]}</span>
            </span>
          ))}
        </p>
        <nav aria-label="Filters" className="flex flex-wrap gap-1.5">
          <FilterLink
            active={query.filter === "todo"}
            to={href(query, { filter: "todo" })}
          >
            To review
          </FilterLink>
          <FilterLink
            active={query.filter === "done"}
            to={href(query, { filter: "done" })}
          >
            Reviewed
          </FilterLink>
          <FilterLink
            active={query.filter === "all"}
            to={href(query, { filter: "all" })}
          >
            All
          </FilterLink>
          <span className="mx-1 w-px bg-border" aria-hidden="true" />
          <FilterLink
            active={query.autoLabel === null}
            to={href(query, { autoLabel: null })}
          >
            Any auto label
          </FilterLink>
          {ROAD_LABELS.map((label) => (
            <FilterLink
              key={label}
              active={query.autoLabel === label}
              to={href(query, { autoLabel: label })}
            >
              {ROAD_LABEL_NAMES[label]}
            </FilterLink>
          ))}
          <FilterLink
            active={query.autoLabel === "none"}
            to={href(query, { autoLabel: "none" })}
          >
            No auto label
          </FilterLink>
        </nav>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {counts.total === 0
            ? "No snapshots yet. They appear after the collector runs."
            : "Nothing here with these filters."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <LabelCard key={item.id} data={toCard(item)} />
          ))}
        </div>
      )}

      {items.length === PAGE_SIZE && (
        <Link
          href={href(query, { before: items.at(-1)!.id })}
          prefetch={false}
          className="inline-block rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          Older snapshots
        </Link>
      )}
    </div>
  )
}

export default function LabelPage({ searchParams }: PageProps<"/admin/label">) {
  return (
    <div className="min-h-dvh">
      <SkipLink />
      <header className="border-b bg-sidebar">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Brand />
          <ThemeToggle />
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto max-w-7xl px-4 py-6 outline-none"
      >
        <h1 className="mb-1 text-lg font-semibold tracking-tight">
          Label road conditions
        </h1>
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
          Check each photo against its automatic label and fix it if needed.
          Focus a card and press 1 dry, 2 wet, 3 partly snow, 4 snow covered, 5
          can&apos;t see, 0 none fits. Your label wins over the automatic one.
        </p>
        <Suspense
          fallback={<p className="text-sm text-muted-foreground">Loading…</p>}
        >
          <Board searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  )
}
