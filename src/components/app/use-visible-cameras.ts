"use client"

import { useMemo } from "react"

import { useFavorites } from "@/lib/client/favorites"
import { useCameras } from "@/lib/client/queries"
import type { ClientCamera } from "@/lib/client/types"
import type { CameraSource } from "@/lib/db/schema"

import { useAppState, type Filters } from "./app-state"

function matches(
  camera: ClientCamera,
  filters: Filters,
  favorites: ReadonlySet<string>
): boolean {
  if (filters.area !== "all" && camera.area !== filters.area) return false
  if (filters.source !== "all" && camera.source !== filters.source) return false
  if (filters.quadrant !== "all" && camera.quadrant !== filters.quadrant) {
    return false
  }
  if (filters.status !== "all" && camera.status !== filters.status) return false
  if (filters.favoritesOnly && !favorites.has(camera.id)) return false

  const q = filters.search.trim().toLowerCase()
  if (q) {
    const haystack = `${camera.name} ${camera.road ?? ""}`.toLowerCase()
    if (!haystack.includes(q)) return false
  }
  return true
}

export function useVisibleCameras() {
  const query = useCameras()
  const favorites = useFavorites()
  const { filters } = useAppState()

  const all = useMemo(() => query.data ?? [], [query.data])

  const visible = useMemo(
    () => all.filter((c) => matches(c, filters, favorites)),
    [all, filters, favorites]
  )

  const quadrants = useMemo(() => {
    const set = new Set<string>()
    for (const c of all) if (c.quadrant) set.add(c.quadrant)
    return [...set].sort()
  }, [all])

  const sources = useMemo(() => {
    const set = new Set<CameraSource>()
    for (const c of all) set.add(c.source)
    return [...set].sort()
  }, [all])

  return {
    all,
    visible,
    quadrants,
    sources,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
