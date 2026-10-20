"use client"

import { Camera, Star } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { toggleFavorite, useFavorites } from "@/lib/client/favorites"
import type { ClientCamera } from "@/lib/client/types"
import { sourceLabel } from "@/lib/format"
import { cn } from "@/lib/utils"

import { useAppState } from "./app-state"
import { StatusDot } from "./status-dot"
import { useVisibleCameras } from "./use-visible-cameras"

function Row({
  camera,
  selected,
  favorite,
  onSelect,
}: {
  camera: ClientCamera
  selected: boolean
  favorite: boolean
  onSelect: () => void
}) {
  return (
    <div
      className={cn(
        "group flex h-12 items-center gap-2 rounded-md px-2 transition-colors",
        selected ? "bg-accent" : "hover:bg-muted"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 self-stretch rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-current={selected ? "true" : undefined}
      >
        <StatusDot status={camera.status} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{camera.name}</span>
          <span className="block truncate font-mono text-[11px] text-muted-foreground">
            {sourceLabel(camera.source)}
            {camera.quadrant ? ` · ${camera.quadrant}` : ""}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => toggleFavorite(camera.id)}
        aria-label={favorite ? "Remove favorite" : "Add favorite"}
        aria-pressed={favorite}
        className={cn(
          "rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100",
          favorite && "opacity-100"
        )}
      >
        <Star
          className={cn("size-4", favorite && "fill-amber-400 text-amber-400")}
          aria-hidden="true"
        />
      </button>
    </div>
  )
}

// Windowed rendering: only the rows in view (plus a margin) are in the DOM.
// Rendering all 625+ rows was the map page's biggest hydration cost, and on
// phones they were rendered into the CSS-hidden desktop sidebar for nothing.
const ROW_HEIGHT = 48 // h-12 rows
const OVERSCAN = 8
// Rows rendered before the list has been measured (server render, hidden).
const INITIAL_ROWS = 24

function useWindow(count: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ top: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setView({ top: el.scrollTop, height: el.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    el.addEventListener("scroll", update, { passive: true })
    return () => {
      observer.disconnect()
      el.removeEventListener("scroll", update)
    }
  }, [])

  const visibleRows =
    view.height === 0 ? INITIAL_ROWS : Math.ceil(view.height / ROW_HEIGHT)
  const start = Math.max(0, Math.floor(view.top / ROW_HEIGHT) - OVERSCAN)
  const end = Math.min(
    count,
    Math.floor(view.top / ROW_HEIGHT) + visibleRows + OVERSCAN
  )
  return { ref, start, end }
}

export function CameraList({
  onSelect,
  className,
}: {
  onSelect?: () => void
  className?: string
}) {
  const { visible, all, isLoading, isError } = useVisibleCameras()
  const { selectedId, setSelectedId } = useAppState()
  const favorites = useFavorites()
  const { ref, start, end } = useWindow(visible.length)

  return (
    <div ref={ref} className={cn("overflow-y-auto", className)}>
      <ListBody
        visible={visible}
        all={all}
        isLoading={isLoading}
        isError={isError}
        start={start}
        end={end}
        renderRow={(camera, index) => (
          <li
            key={camera.id}
            aria-setsize={visible.length}
            aria-posinset={index + 1}
          >
            <Row
              camera={camera}
              selected={camera.id === selectedId}
              favorite={favorites.has(camera.id)}
              onSelect={() => {
                setSelectedId(camera.id)
                onSelect?.()
              }}
            />
          </li>
        )}
      />
    </div>
  )
}

function ListBody({
  visible,
  all,
  isLoading,
  isError,
  start,
  end,
  renderRow,
}: {
  visible: readonly ClientCamera[]
  all: readonly ClientCamera[]
  isLoading: boolean
  isError: boolean
  start: number
  end: number
  renderRow: (camera: ClientCamera, index: number) => React.ReactNode
}) {
  if (isLoading) {
    return (
      <div
        className="space-y-1 p-2"
        aria-busy="true"
        aria-label="Loading cameras"
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1.5">
            <Skeleton className="size-2 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2.5 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (isError && all.length === 0) {
    return (
      <EmptyMessage
        title="Couldn't load cameras"
        hint="Check your connection and try again."
      />
    )
  }

  if (all.length === 0) {
    return (
      <EmptyMessage
        title="No cameras yet"
        hint="Camera data arrives once the first sync runs."
      />
    )
  }

  if (visible.length === 0) {
    return (
      <EmptyMessage
        title="No cameras match"
        hint="Try clearing a filter or the search."
      />
    )
  }

  // Spacers stand in for the rows outside the window, so the scrollbar and
  // scroll position behave as if every row were there.
  return (
    <ul
      className="p-2"
      style={{
        paddingTop: 8 + start * ROW_HEIGHT,
        paddingBottom: 8 + (visible.length - end) * ROW_HEIGHT,
      }}
    >
      {visible
        .slice(start, end)
        .map((camera, i) => renderRow(camera, start + i))}
    </ul>
  )
}

function EmptyMessage({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Camera className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}
