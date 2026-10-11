"use client"

import { useSyncExternalStore } from "react"

// Favorites live only in the viewer's browser. All access is wrapped in
// try/catch so private mode or blocked storage degrades to "no favorites".
const KEY = "camyyc:favorites"

const EMPTY: ReadonlySet<string> = new Set()
let favorites: ReadonlySet<string> = EMPTY
let loaded = false
const listeners = new Set<() => void>()

function load(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return new Set(
      Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : []
    )
  } catch {
    return new Set()
  }
}

function ensureLoaded() {
  if (loaded) return
  loaded = true
  if (typeof window !== "undefined") favorites = load()
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify([...favorites]))
  } catch {
    // ignore: storage unavailable
  }
}

export function toggleFavorite(id: string): void {
  ensureLoaded()
  const next = new Set(favorites)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  favorites = next
  persist()
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  ensureLoaded()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): ReadonlySet<string> {
  ensureLoaded()
  return favorites
}

function getServerSnapshot(): ReadonlySet<string> {
  return EMPTY
}

export function useFavorites(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
