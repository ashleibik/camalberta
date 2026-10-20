"use client"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { sourceLabel } from "@/lib/format"

import { useAppState } from "./app-state"
import { StatusDot } from "./status-dot"
import { useVisibleCameras } from "./use-visible-cameras"

/**
 * The camera search dialog. Loaded on demand by CommandPalette
 * (command-palette.tsx), which also owns the Ctrl/Cmd + K shortcut.
 */
export default function CommandPaletteDialog() {
  const { commandOpen, setCommandOpen, setSelectedId } = useAppState()
  const { all } = useVisibleCameras()

  return (
    <CommandDialog
      open={commandOpen}
      onOpenChange={setCommandOpen}
      title="Search cameras"
      description="Search cameras by name or road"
    >
      <Command>
        <CommandInput placeholder="Search cameras by name or road…" />
        <CommandList>
          <CommandEmpty>No cameras found.</CommandEmpty>
          <CommandGroup heading="Cameras">
            {all.map((camera) => (
              <CommandItem
                key={camera.id}
                value={`${camera.name} ${camera.road ?? ""} ${camera.id}`}
                onSelect={() => {
                  setSelectedId(camera.id)
                  setCommandOpen(false)
                }}
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
    </CommandDialog>
  )
}
