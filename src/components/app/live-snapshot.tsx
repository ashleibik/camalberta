"use client"

import { useEffect, useState } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { cameraImageUrl } from "@/lib/client/api"
import { useClock } from "@/lib/client/use-clock"
import { cn } from "@/lib/utils"

// Cameras publish still photos on a fixed rhythm (Calgary: once a minute).
// The proxy tells us when each photo was taken (Last-Modified) and when the
// next one is due (X-Next-Snapshot), so we fetch right after it appears
// instead of polling on a blind timer.
const BUCKET_MS = 30_000 // shared cache-key window for ?t=
const FALLBACK_DELAY_MS = 30_000 // no timing hints from the server
const CLIENT_GRACE_MS = 1_000 // wait past the predicted publish time
const MIN_DELAY_MS = 2_000
// Photos land ~60s apart but the next one is often ~62s away once publication
// delay is included; a 60s cap would ask a moment too early.
const MAX_DELAY_MS = 120_000
const OVERDUE_DELAY_MS = 5_000 // matches the proxy's OVERDUE_TTL_MS
const ERROR_DELAY_MS = 15_000
const FROZEN_AFTER_S = 10 * 60 // matches STALE_PHOTO_MS on the server

interface SnapshotState {
  src: string | null
  takenAt: number | null
  nextAt: number | null
  intervalSec: number | null
  /** When a genuinely new photo last arrived (null for the first one). */
  freshAt: number | null
}

const EMPTY: SnapshotState = {
  src: null,
  takenAt: null,
  nextAt: null,
  intervalSec: null,
  freshAt: null,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function parseTime(value: string | null): number | null {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function nextDelay(nextAt: number | null, intervalSec: number | null): number {
  if (nextAt === null) return FALLBACK_DELAY_MS
  const untilNext = nextAt - Date.now()
  if (untilNext > 0) {
    return clamp(untilNext + CLIENT_GRACE_MS, MIN_DELAY_MS, MAX_DELAY_MS)
  }
  // Late photo: check again soon, but back off if it's very late (frozen).
  const intervalMs = (intervalSec ?? 60) * 1000
  return -untilNext > intervalMs ? FALLBACK_DELAY_MS : OVERDUE_DELAY_MS
}

/**
 * Keeps a camera's photo fresh while `active` and the tab is visible. The new
 * photo is decoded off-screen before it replaces the old one, so the image
 * never blanks, and it only swaps when the photo is actually newer.
 */
function useLiveSnapshot(id: string, active: boolean): SnapshotState {
  const [state, setState] = useState<SnapshotState>(EMPTY)

  useEffect(() => {
    if (!active) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | null = null
    let shownUrl: string | null = null
    let shownTakenAt: number | null = null
    let firstFrame = true

    const schedule = (ms: number) => {
      clearTimeout(timer)
      timer = setTimeout(() => void tick(), ms)
    }

    const tick = async () => {
      if (cancelled || document.visibilityState !== "visible") return
      controller?.abort()
      const ctrl = new AbortController()
      controller = ctrl

      let delay = FALLBACK_DELAY_MS
      try {
        const bucket = Math.floor(Date.now() / BUCKET_MS)
        const res = await fetch(cameraImageUrl(id, bucket), {
          cache: "no-store",
          signal: ctrl.signal,
        })
        const takenAt = parseTime(res.headers.get("last-modified"))
        const nextAt = parseTime(res.headers.get("x-next-snapshot"))
        const rawInterval = Number(res.headers.get("x-snapshot-interval"))
        const intervalSec = rawInterval > 0 ? rawInterval : null

        const isNewer =
          shownTakenAt === null || takenAt === null || takenAt > shownTakenAt

        if (res.ok && isNewer) {
          const url = URL.createObjectURL(await res.blob())
          try {
            const img = new Image()
            img.src = url
            await img.decode()
          } catch {
            // Undecodable: still swap; the browser shows what it can.
          }
          if (cancelled) {
            URL.revokeObjectURL(url)
            return
          }
          const previous = shownUrl
          shownUrl = url
          shownTakenAt = takenAt
          const freshAt = firstFrame ? null : Date.now()
          firstFrame = false
          setState({ src: url, takenAt, nextAt, intervalSec, freshAt })
          // Free the old frame once the new one has painted.
          if (previous) setTimeout(() => URL.revokeObjectURL(previous), 2_000)
        } else {
          // Same (or an older) photo: drop the body, just update the timing.
          void res.body?.cancel().catch(() => {})
          if (!cancelled) {
            setState((s) => ({
              ...s,
              nextAt,
              intervalSec: intervalSec ?? s.intervalSec,
            }))
          }
        }

        delay = nextDelay(nextAt, intervalSec)
      } catch {
        if (cancelled) return
        delay = ERROR_DELAY_MS
      }
      if (!cancelled) schedule(delay)
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        schedule(0)
      } else {
        clearTimeout(timer)
        controller?.abort()
      }
    }

    document.addEventListener("visibilitychange", onVisibility)
    schedule(0)

    return () => {
      cancelled = true
      clearTimeout(timer)
      controller?.abort()
      document.removeEventListener("visibilitychange", onVisibility)
      const last = shownUrl
      // Defer: the <img> may still be showing this frame during a remount.
      if (last) setTimeout(() => URL.revokeObjectURL(last), 10_000)
    }
  }, [id, active])

  return state
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86_400)}d ago`
}

function LiveBadge({ ageSec }: { ageSec: number | null }) {
  const frozen = ageSec !== null && ageSec >= FROZEN_AFTER_S
  return (
    <span className="pointer-events-none absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium tracking-wide text-white uppercase">
      <span className="relative flex size-2">
        {!frozen && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-live opacity-75 motion-reduce:hidden" />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            frozen ? "bg-status-stale" : "bg-status-live"
          )}
        />
      </span>
      {frozen ? "Old photo" : "Live"}
      {ageSec !== null && (
        <span className="font-mono normal-case opacity-80">
          {formatAge(ageSec)}
        </span>
      )}
    </span>
  )
}

export function LiveSnapshot({
  id,
  name,
  active = true,
  showTiming = false,
  className,
}: {
  id: string
  name: string
  active?: boolean
  /** Show "new photo about every Ns · next in ~Ns" under the image. */
  showTiming?: boolean
  className?: string
}) {
  const snap = useLiveSnapshot(id, active)
  const now = useClock()

  const ageSec =
    snap.takenAt !== null && now !== null
      ? Math.max(0, Math.round((now - snap.takenAt) / 1000))
      : null
  const justUpdated =
    snap.freshAt !== null && now !== null && now - snap.freshAt < 2_500
  const frozen = ageSec !== null && ageSec >= FROZEN_AFTER_S

  let timing: string | null = null
  if (showTiming && snap.src) {
    if (frozen && ageSec !== null) {
      timing = `No new photo for ${formatAge(ageSec).replace(" ago", "")}. The camera may be down at the source.`
    } else if (snap.intervalSec !== null) {
      const untilNext =
        snap.nextAt !== null && now !== null
          ? Math.ceil((snap.nextAt - now) / 1000)
          : null
      const next =
        untilNext === null
          ? ""
          : untilNext > 0
            ? ` · next in ~${untilNext}s`
            : " · next photo any moment"
      timing = `Still photos, not video: a new one about every ${snap.intervalSec}s${next}`
    }
  }

  return (
    <div className={className}>
      <div
        className={cn(
          "relative aspect-video w-full overflow-hidden rounded-lg border bg-muted transition-shadow duration-500",
          justUpdated && "ring-2 ring-status-live/80"
        )}
      >
        {snap.src ? (
          // eslint-disable-next-line @next/next/no-img-element -- object URL of a proxied, time-bucketed photo
          <img
            src={snap.src}
            alt={`Live snapshot of ${name}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <Skeleton className="h-full w-full rounded-none" />
        )}
        {snap.src && <LiveBadge ageSec={ageSec} />}
      </div>
      {timing && (
        <p className="mt-1.5 text-[11px] text-muted-foreground" aria-live="off">
          {timing}
        </p>
      )}
    </div>
  )
}
