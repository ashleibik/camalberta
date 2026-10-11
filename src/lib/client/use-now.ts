"use client"

import { useEffect, useState } from "react"

/**
 * The current time in ms, updated on an interval. Returns null until after
 * mount so render stays stable during the static shell (no `Date.now()` at
 * render time, which cacheComponents flags as unstable).
 */
export function useNow(intervalMs = 60_000): number | null {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    const update = () => setNow(Date.now())
    update()
    const id = setInterval(update, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
