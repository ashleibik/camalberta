"use client"

import { useEffect } from "react"

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

export function CommandPalette() {
  const { commandOpen, setCommandOpen, setSelectedId } = useAppState()
  const { all } = useVisibleCameras()

  // Ctrl/Cmd + K toggles the palette.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCommandOpen(!commandOpen)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [commandOpen, setCommandOpen])

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
