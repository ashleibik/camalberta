"use client"

import { Search } from "lucide-react"

import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

import { useAppState } from "./app-state"
import { CameraList } from "./camera-list"
import { preloadCommandPalette } from "./command-palette"
import { Filters } from "./filters"
import { useVisibleCameras } from "./use-visible-cameras"

export function SidebarContent({
  className,
  onNavigate,
}: {
  className?: string
  onNavigate?: () => void
}) {
  const { setCommandOpen } = useAppState()
  const { visible, all, isLoading } = useVisibleCameras()

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="p-3">
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          onPointerEnter={preloadCommandPalette}
          onFocus={preloadCommandPalette}
          className="flex w-full items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
        >
          <Search className="size-4" aria-hidden="true" />
          <span className="flex-1 text-left">Search cameras or roads</span>
          <kbd className="rounded border bg-muted px-1.5 font-mono text-[10px]">
            Ctrl K
          </kbd>
        </button>
      </div>

      <Separator />

      <div className="p-3">
        <Filters />
      </div>

      <Separator />

      <div className="flex items-center justify-between px-4 py-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Cameras
        </h2>
        {!isLoading && (
          <span className="font-mono text-xs text-muted-foreground">
            {visible.length}
            {visible.length !== all.length ? ` / ${all.length}` : ""}
          </span>
        )}
      </div>

      <CameraList className="min-h-0 flex-1" onSelect={onNavigate} />
    </div>
  )
}
