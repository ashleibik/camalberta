"use client"

import { ChevronLeft, ChevronRight, Video } from "lucide-react"
import { useRef } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { TripCamera } from "@/lib/api-types"
import { cameraImageUrl } from "@/lib/client/api"
import { isVideoSource } from "@/lib/media"

import { useAppState } from "../app-state"
import { StatusDot } from "../status-dot"

// Thumbnails refresh with the report (every minute), in 2-minute cache
// buckets: a glance at the road, not a live view. Tap for the live one.
const THUMB_BUCKET_MS = 120_000

function Thumbnail({ camera, bucket }: { camera: TripCamera; bucket: number }) {
  if (isVideoSource(camera.source)) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-1 bg-muted text-muted-foreground">
        <Video className="size-5" aria-hidden="true" />
        <span className="text-[10px] font-medium tracking-wide uppercase">
          Live video
        </span>
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a proxied live snapshot, not a static asset next/image could optimize
    <img
      src={cameraImageUrl(camera.id, bucket)}
      alt={`Latest photo from ${camera.name}`}
      loading="lazy"
      decoding="async"
      className="size-full object-cover"
    />
  )
}

export function CameraStrip({
  cameras,
  fetchedAt,
}: {
  cameras: readonly TripCamera[]
  /** When the report was fetched (ms), to refresh thumbnails with it. */
  fetchedAt: number
}) {
  const { setSelectedId } = useAppState()
  const listRef = useRef<HTMLUListElement>(null)
  const bucket = Math.floor(fetchedAt / THUMB_BUCKET_MS)

  const scroll = (direction: 1 | -1) => {
    const list = listRef.current
    if (!list) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    list.scrollBy({
      left: direction * list.clientWidth * 0.85,
      behavior: reduce ? "auto" : "smooth",
    })
  }

  return (
    <section aria-labelledby="strip-heading" data-testid="camera-strip">
      <div className="mb-2 flex items-end justify-between gap-2">
        <div>
          <h2 id="strip-heading" className="text-sm font-semibold">
            Cameras on the way
          </h2>
          <p className="text-xs text-muted-foreground">
            {cameras.length === 0
              ? "No cameras along this route right now."
              : `${cameras.length} views in driving order, km from Calgary`}
          </p>
        </div>
        {cameras.length > 2 && (
          <div className="hidden gap-1 sm:flex">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Scroll cameras back"
              onClick={() => scroll(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Scroll cameras forward"
              onClick={() => scroll(1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      {cameras.length > 0 && (
        <ul
          ref={listRef}
          className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2"
        >
          {cameras.map((camera) => (
            <li key={camera.id} className="w-40 shrink-0 snap-start sm:w-48">
              <button
                type="button"
                onClick={() => setSelectedId(camera.id)}
                className="group w-full rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted transition-opacity duration-150 group-hover:opacity-90">
                  <Thumbnail camera={camera} bucket={bucket} />
                  <span className="absolute top-1.5 left-1.5 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[10px] text-white">
                    km {Math.round(camera.km)}
                  </span>
                </div>
                <span className="mt-1.5 flex items-start gap-1.5">
                  <StatusDot status={camera.status} className="mt-1" />
                  <span className="line-clamp-2 text-xs font-medium">
                    {camera.name}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function CameraStripSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden" aria-busy="true">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="w-40 shrink-0 space-y-1.5 sm:w-48">
          <Skeleton className="aspect-video w-full rounded-lg" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  )
}
