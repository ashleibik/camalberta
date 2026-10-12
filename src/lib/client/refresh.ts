"use client"

import { useEffect, useRef } from "react"

// A tiny event bus so a button anywhere (a wall tile, "Refresh all") can ask
// the camera views on screen to check for a new picture right now.
const bus = new EventTarget()
const EVENT = "camyyc:refresh"

/** Ask one camera's view (or, with no id, every view) to refresh now. */
export function requestRefresh(id?: string): void {
  bus.dispatchEvent(
    new CustomEvent<string | null>(EVENT, { detail: id ?? null })
  )
}

/** Run `onRefresh` whenever a refresh is requested for `id` (or for all). */
export function useRefreshRequests(id: string, onRefresh: () => void): void {
  const callback = useRef(onRefresh)
  useEffect(() => {
    callback.current = onRefresh
  })

  useEffect(() => {
    const handler = (event: Event) => {
      const target = (event as CustomEvent<string | null>).detail
      if (target === null || target === id) callback.current()
    }
    bus.addEventListener(EVENT, handler)
    return () => bus.removeEventListener(EVENT, handler)
  }, [id])
}
