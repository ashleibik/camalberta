"use client"

import { z } from "zod"

import { cameraIdSchema } from "@/lib/camera-id"

export const GRID_SIZES = [1, 2, 3, 4] as const
export type GridSize = (typeof GRID_SIZES)[number]

export const MAX_TILES = 16

export interface WallConfig {
  grid: GridSize
  cams: string[]
}

export const DEFAULT_WALL: WallConfig = { grid: 2, cams: [] }

const KEY = "camalberta:wall"

const gridSchema = z.coerce
  .number()
  .int()
  .refine((n): n is GridSize => GRID_SIZES.includes(n as GridSize))
  .catch(2 as GridSize)

const camsSchema = z
  .array(z.string())
  .catch([])
  .transform((arr) =>
    arr.filter((c) => cameraIdSchema.safeParse(c).success).slice(0, MAX_TILES)
  )

const configSchema = z.object({ grid: gridSchema, cams: camsSchema })

/** Parse a wall config from a URL query string, or null if it carries none. */
export function parseWallParams(search: string): WallConfig | null {
  const params = new URLSearchParams(search)
  if (!params.has("grid") && !params.has("cams")) return null
  const grid = gridSchema.parse(params.get("grid") ?? "2")
  const cams = camsSchema.parse(
    (params.get("cams") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  )
  return { grid, cams }
}

export function wallToSearch(wall: WallConfig): string {
  const params = new URLSearchParams()
  params.set("grid", String(wall.grid))
  if (wall.cams.length) params.set("cams", wall.cams.join(","))
  return params.toString()
}

export function loadWall(): WallConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_WALL
    const parsed = configSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : DEFAULT_WALL
  } catch {
    return DEFAULT_WALL
  }
}

export function saveWall(wall: WallConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(wall))
  } catch {
    // ignore: storage unavailable
  }
}

/** Append a camera to the saved wall (deduped, capped), returning the result. */
export function addToWall(id: string): WallConfig {
  const wall = loadWall()
  if (wall.cams.includes(id) || wall.cams.length >= MAX_TILES) return wall
  const next = { ...wall, cams: [...wall.cams, id] }
  saveWall(next)
  return next
}
