"use client"

import { useQuery } from "@tanstack/react-query"

import type { TripId } from "@/lib/trip/trips"

import {
  fetchCamera,
  fetchCameras,
  fetchHealth,
  fetchPushKey,
  fetchTripReport,
} from "./api"

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

/** Trip Check data. The server refreshes it every sync (15 min). */
export function useTripReport(trip: TripId) {
  return useQuery({
    queryKey: ["trip", trip],
    queryFn: () => fetchTripReport(trip),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function usePushKey() {
  return useQuery({
    queryKey: ["push-key"],
    queryFn: fetchPushKey,
    staleTime: Infinity,
    retry: false,
  })
}
