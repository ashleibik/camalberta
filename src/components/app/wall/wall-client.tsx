"use client"

import { ArrowLeft, LayoutGrid, Plus } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { Brand } from "@/components/shell/brand"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useCameras } from "@/lib/client/queries"
import type { ClientCamera } from "@/lib/client/types"
import {
  GRID_SIZES,
  loadWall,
  MAX_TILES,
  parseWallParams,
  saveWall,
  wallToSearch,
  type GridSize,
  type WallConfig,
} from "@/lib/client/wall"
import { cn } from "@/lib/utils"

import { AddCameraDialog } from "./add-camera-dialog"
import { WallTile } from "./wall-tile"

const GRID_COLS: Record<GridSize, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
}

export default function WallClient() {
  // Safe to read the URL synchronously: this component only renders on the
  // client (dynamic ssr:false).
  const [wall, setWall] = useState<WallConfig>(
    () => parseWallParams(window.location.search) ?? loadWall()
  )
  const [addOpen, setAddOpen] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  const { data: cameras } = useCameras()
  const camById = useMemo(() => {
    const map = new Map<string, ClientCamera>()
    for (const c of cameras ?? []) map.set(c.id, c)
    return map
  }, [cameras])

  // Persist to localStorage and mirror into the URL (shareable).
  useEffect(() => {
    saveWall(wall)
    window.history.replaceState(null, "", `/wall?${wallToSearch(wall)}`)
  }, [wall])

  const setGrid = (grid: GridSize) => setWall((w) => ({ ...w, grid }))
  const removeTile = (id: string) =>
    setWall((w) => ({ ...w, cams: w.cams.filter((c) => c !== id) }))
  const addTile = (id: string) =>
    setWall((w) =>
      w.cams.includes(id) || w.cams.length >= MAX_TILES
        ? w
        : { ...w, cams: [...w.cams, id] }
    )

  const moveTile = (from: number, to: number) =>
    setWall((w) => {
      if (from === to) return w
      const cams = [...w.cams]
      const [moved] = cams.splice(from, 1)
      if (moved === undefined) return w
      cams.splice(to, 0, moved)
      return { ...w, cams }
    })

  const endDrag = () => {
    if (dragIndex !== null && overIndex !== null) moveTile(dragIndex, overIndex)
    setDragIndex(null)
    setOverIndex(null)
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-sidebar px-4 py-2">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Back to map">
            <Brand />
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft aria-hidden="true" />
              Map
            </Link>
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={String(wall.grid)}
            onValueChange={(v) => v && setGrid(Number(v) as GridSize)}
            variant="outline"
            size="sm"
          >
            {GRID_SIZES.map((n) => (
              <ToggleGroupItem
                key={n}
                value={String(n)}
                aria-label={`${n} by ${n}`}
              >
                {n}×{n}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddOpen(true)}
            disabled={wall.cams.length >= MAX_TILES}
          >
            <Plus aria-hidden="true" />
            Add camera
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-4">
        {wall.cams.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <LayoutGrid
              className="size-10 text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium">Your wall is empty</p>
              <p className="text-xs text-muted-foreground">
                Add cameras to watch several live snapshots at once.
              </p>
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus aria-hidden="true" />
              Add camera
            </Button>
          </div>
        ) : (
          <div className={cn("grid gap-3", GRID_COLS[wall.grid])}>
            {wall.cams.map((id, index) => (
              <WallTile
                key={id}
                id={id}
                camera={camById.get(id)}
                onRemove={() => removeTile(id)}
                dnd={{
                  isOver: overIndex === index && dragIndex !== index,
                  isDragging: dragIndex === index,
                  onDragStart: () => setDragIndex(index),
                  onDragEnter: () => setOverIndex(index),
                  onDragEnd: endDrag,
                  onDrop: endDrag,
                }}
              />
            ))}
          </div>
        )}
      </main>

      <AddCameraDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        cameras={cameras ?? []}
        existing={wall.cams}
        onAdd={addTile}
      />
    </div>
  )
}
