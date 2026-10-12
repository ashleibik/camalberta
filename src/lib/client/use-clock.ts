"use client"

import { useSyncExternalStore } from "react"

// One shared 1-second ticker for every component that shows a live age
// ("23s ago"), so a 16-tile wall runs one timer instead of sixteen. The time
// is read from a variable updated by the timer, never computed during render,
// which keeps the static shell stable (cacheComponents) and gives
// useSyncExternalStore a cached snapshot.
let now: number | null = null
let timer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (timer === null) {
    now = Date.now()
    timer = setInterval(() => {
      now = Date.now()
      emit()
    }, 1000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
      now = null
    }
  }
}

/** Current time in ms, updated every second; null until mounted. */
export function useClock(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => null
  )
}
