"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"

import { useAppState } from "./app-state"

// The dialog brings cmdk and the search UI; most visits never open it, so it
// loads on first use (or when the search box is hovered or focused).
const CommandPaletteDialog = dynamic(() => import("./command-palette-dialog"), {
  ssr: false,
})

export function preloadCommandPalette() {
  void import("./command-palette-dialog")
}

/** Ctrl/Cmd + K, and the search dialog once it's first wanted. */
export function CommandPalette() {
  const { commandOpen, setCommandOpen } = useAppState()
  const [wanted, setWanted] = useState(false)
  if (commandOpen && !wanted) setWanted(true)

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

  return wanted ? <CommandPaletteDialog /> : null
}
