"use client"

import { Camera, Star } from "lucide-react"

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
        "group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
        selected ? "bg-accent" : "hover:bg-muted"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none"
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

export function CameraList({ onSelect }: { onSelect?: () => void }) {
  const { visible, all, isLoading, isError } = useVisibleCameras()
  const { selectedId, setSelectedId } = useAppState()
  const favorites = useFavorites()

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

  return (
    <ul className="space-y-0.5 p-2">
      {visible.map((camera) => (
        <li key={camera.id}>
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
      ))}
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
