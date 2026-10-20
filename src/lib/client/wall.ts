// The brief asks for the wall's URL config to be validated with Zod; zod/mini
// keeps that light. jitless config first, before any schema parses (see
// zod-config.ts: our CSP blocks Zod's eval probe).
import "@/lib/zod-config"

import * as z from "zod/mini"

import { isCameraId } from "@/lib/camera-id"

export const GRID_SIZES = [1, 2, 3, 4] as const
export type GridSize = (typeof GRID_SIZES)[number]

export const MAX_TILES = 16

export interface WallConfig {
  grid: GridSize
  cams: string[]
}

export const DEFAULT_WALL: WallConfig = { grid: 2, cams: [] }

/**
 * Where the wall is kept: the URL (shareable), localStorage, and a small
 * cookie mirror scoped to /wall. The cookie lets the server render the right
 * wall straight away (no "empty wall" flash, early first paint). It holds
 * only the grid size and camera ids, is never used for anything else, and is
 * parsed with the same strict schema as the URL.
 */
const KEY = "camalberta:wall"
export const WALL_COOKIE = "camalberta_wall"
const COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60

// A grid size from a URL ("3") or storage (3); anything else becomes 2.
const gridSchema = z.catch(
  z.pipe(z.coerce.number(), z.literal([...GRID_SIZES])),
  2 as GridSize
)

// Camera ids, keeping only well-formed ones, at most MAX_TILES.
const camsSchema = z.pipe(
  z.catch(z.array(z.string()), []),
  z.transform((arr: string[]) => arr.filter(isCameraId).slice(0, MAX_TILES))
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
  try {
    const secure = location.protocol === "https:" ? "; Secure" : ""
    document.cookie = `${WALL_COOKIE}=${encodeURIComponent(wallToSearch(wall))}; Path=/wall; Max-Age=${COOKIE_MAX_AGE_S}; SameSite=Lax${secure}`
  } catch {
    // ignore: cookies unavailable
  }
}

/** The wall stored in the cookie (untrusted input), or null. */
export function wallFromCookie(value: string | undefined): WallConfig | null {
  if (!value || value.length > 4096) return null
  try {
    return parseWallParams(`?${decodeURIComponent(value)}`)
  } catch {
    return null
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
