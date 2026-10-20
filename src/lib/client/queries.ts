"use client"

import { useQuery } from "@tanstack/react-query"

import type { TripReport } from "@/lib/api-types"
import type { TripId } from "@/lib/trip/trips"

import { fetchCamera, fetchCameras, fetchHealth, fetchTripReport } from "./api"

export function useCameras() {
  return useQuery({
    queryKey: ["cameras"],
    queryFn: fetchCameras,
    staleTime: 5 * 60_000,
  })
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

export function useCamera(id: string | null) {
  return useQuery({
    queryKey: ["camera", id],
    queryFn: () => fetchCamera(id!),
    enabled: id !== null,
    staleTime: 60_000,
  })
}

/**
 * Trip Check data. The server refreshes it every sync (15 min). `initial` is
 * the report the server rendered the page with, so the first view needs no
 * request.
 */
export function useTripReport(trip: TripId, initial?: TripReport | null) {
  return useQuery({
    queryKey: ["trip", trip],
    queryFn: () => fetchTripReport(trip),
    initialData: initial ?? undefined,
    initialDataUpdatedAt: initial ? Date.parse(initial.generatedAt) : undefined,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
}
