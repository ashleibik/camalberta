"use client"

import { GripVertical, X } from "lucide-react"

import { LiveSnapshot } from "@/components/app/live-snapshot"
import { StatusDot } from "@/components/app/status-dot"
import type { ClientCamera } from "@/lib/client/types"
import { cn } from "@/lib/utils"

export interface TileDnd {
  isOver: boolean
  isDragging: boolean
  onDragStart: () => void
  onDragEnter: () => void
  onDragEnd: () => void
  onDrop: () => void
}

export function WallTile({
  id,
  camera,
  onRemove,
  dnd,
}: {
  id: string
  camera: ClientCamera | undefined
  onRemove: () => void
  dnd: TileDnd
}) {
  const name = camera?.name ?? id

  return (
    <div
      draggable
      onDragStart={dnd.onDragStart}
      onDragEnter={dnd.onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={dnd.onDragEnd}
      onDrop={(e) => {
        e.preventDefault()
        dnd.onDrop()
      }}
      className={cn(
        "group relative transition-opacity",
        dnd.isOver &&
          "ring-2 ring-primary ring-offset-2 ring-offset-background",
        dnd.isDragging && "opacity-40"
      )}
    >
      <LiveSnapshot id={id} name={name} />

      {/* Name + status overlay */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1.5 rounded-b-lg bg-gradient-to-t from-black/75 to-transparent px-2 py-1.5">
        {camera && <StatusDot status={camera.status} />}
        <span className="truncate text-xs font-medium text-white">{name}</span>
      </div>

      {/* Controls */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <span
          className="flex size-6 cursor-grab items-center justify-center rounded bg-black/60 text-white active:cursor-grabbing"
          aria-hidden="true"
        >
          <GripVertical className="size-4" />
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name} from the wall`}
          className="flex size-6 items-center justify-center rounded bg-black/60 text-white hover:bg-black/80"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
