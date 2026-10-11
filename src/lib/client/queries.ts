"use client"

import { useQuery } from "@tanstack/react-query"

import { fetchCamera, fetchCameras, fetchHealth } from "./api"

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
