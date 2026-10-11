"use client"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ClientCamera } from "@/lib/client/types"
import { sourceLabel } from "@/lib/format"

import { StatusDot } from "../status-dot"

export function AddCameraDialog({
  open,
  onOpenChange,
  cameras,
  existing,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  cameras: ClientCamera[]
  existing: string[]
  onAdd: (id: string) => void
}) {
  const existingSet = new Set(existing)
  const available = cameras.filter((c) => !existingSet.has(c.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Add a camera to the wall</DialogTitle>
          <DialogDescription>Search cameras by name or road</DialogDescription>
        </DialogHeader>
        <Command>
          <CommandInput placeholder="Search cameras by name or road…" />
          <CommandList>
            <CommandEmpty>No cameras to add.</CommandEmpty>
            <CommandGroup heading="Cameras">
              {available.map((camera) => (
                <CommandItem
                  key={camera.id}
                  value={`${camera.name} ${camera.road ?? ""} ${camera.id}`}
                  onSelect={() => onAdd(camera.id)}
                >
                  <StatusDot status={camera.status} />
                  <span className="flex-1 truncate">{camera.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {sourceLabel(camera.source)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
