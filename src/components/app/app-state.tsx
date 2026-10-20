"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

import { isCameraId } from "@/lib/camera-id"
import type { CameraSource, CameraStatus } from "@/lib/db/schema"
import type { Area } from "@/lib/sources/areas"

export type AreaFilter = "all" | Area
export type SourceFilter = "all" | CameraSource
export type StatusFilter = "all" | CameraStatus

export interface Filters {
  search: string
  area: AreaFilter
  source: SourceFilter
  quadrant: string // "all" or a quadrant value
  status: StatusFilter
  favoritesOnly: boolean
}

export const DEFAULT_FILTERS: Filters = {
  search: "",
  area: "all",
  source: "all",
  quadrant: "all",
  status: "all",
  favoritesOnly: false,
}

interface AppState {
  filters: Filters
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void
  resetFilters: () => void
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  commandOpen: boolean
  setCommandOpen: (open: boolean) => void
}

const AppStateContext = createContext<AppState | null>(null)

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [selectedId, setSelectedIdState] = useState<string | null>(null)
  const [commandOpen, setCommandOpen] = useState(false)

  // Read an initial ?cam= from the URL once, on mount. Done in an effect (not a
  // lazy initializer) so SSR and first client render agree before syncing.
  useEffect(() => {
    const cam = new URLSearchParams(window.location.search).get("cam")
    // Only a well-formed camera id; anything else in the URL is ignored.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from a browser-only API
    if (isCameraId(cam)) setSelectedIdState(cam)
  }, [])

  const setFilter = useCallback(
    <K extends keyof Filters>(key: K, value: Filters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), [])

  const setSelectedId = useCallback((id: string | null) => {
    setSelectedIdState(id)
    const url = new URL(window.location.href)
    if (id) url.searchParams.set("cam", id)
    else url.searchParams.delete("cam")
    window.history.replaceState(null, "", url)
  }, [])

  const value = useMemo<AppState>(
    () => ({
      filters,
      setFilter,
      resetFilters,
      selectedId,
      setSelectedId,
      commandOpen,
      setCommandOpen,
    }),
    [filters, setFilter, resetFilters, selectedId, setSelectedId, commandOpen]
  )

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  )
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider")
  return ctx
}
