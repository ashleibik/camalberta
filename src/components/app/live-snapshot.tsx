"use client"

import { useEffect, useRef, useState } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { cameraImageUrl } from "@/lib/client/api"
import { cn } from "@/lib/utils"

const REFRESH_MS = 30_000

function currentBucket(): number {
  return Math.floor(Date.now() / REFRESH_MS)
}

/**
 * Keeps a camera's snapshot fresh while `active` and the tab is visible.
 * The next image is preloaded off-screen and only swapped in once it has
 * loaded, so the visible image never blanks. Refreshing stops when the tab is
 * hidden and resumes (with an immediate refresh) when it returns.
 */
function useLiveSnapshot(id: string, active: boolean) {
  const [src, setSrc] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!active) return
    cancelledRef.current = false

    const load = () => {
      const url = cameraImageUrl(id, currentBucket())
      const img = new Image()
      const commit = () => {
        if (cancelledRef.current) return
        setSrc(url)
        setUpdatedAt(Date.now())
      }
      // The proxy returns a placeholder (200) on failure, so onerror is rare;
      // either way we show the latest URL.
      img.onload = commit
      img.onerror = commit
      img.src = url
    }

    let timer: ReturnType<typeof setTimeout>
    const scheduleNext = () => {
      clearTimeout(timer)
      // Align to the next 30s boundary so viewers share the proxy's cache.
      const delay = REFRESH_MS - (Date.now() % REFRESH_MS) + 150
      timer = setTimeout(() => {
        if (document.visibilityState === "visible") load()
        scheduleNext()
      }, delay)
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") load()
    }

    if (document.visibilityState === "visible") load()
    scheduleNext()
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      cancelledRef.current = true
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [id, active])

  return { src, updatedAt }
}

function LiveBadge() {
  return (
    <span className="pointer-events-none absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium tracking-wide text-white uppercase">
      <span className="relative flex size-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-live opacity-75 motion-reduce:hidden" />
        <span className="relative inline-flex size-2 rounded-full bg-status-live" />
      </span>
      Live
    </span>
  )
}

export function LiveSnapshot({
  id,
  name,
  active = true,
  className,
}: {
  id: string
  name: string
  active?: boolean
  className?: string
}) {
  const { src } = useLiveSnapshot(id, active)

  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-lg border bg-muted",
        className
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- proxied, time-bucketed per-camera URL; next/image can't cache-share it
        <img
          src={src}
          alt={`Live snapshot of ${name}`}
          className="h-full w-full object-cover"
        />
      ) : (
        <Skeleton className="h-full w-full rounded-none" />
      )}
      {src && <LiveBadge />}
    </div>
  )
}

export { useLiveSnapshot }
