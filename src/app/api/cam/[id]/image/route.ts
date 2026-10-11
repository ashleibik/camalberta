import { z } from "zod"

import { getCameraById, setCameraStatus } from "@/lib/cameras"
import { getCameraImage } from "@/lib/proxy/image"
import { placeholderResponse } from "@/lib/proxy/placeholder"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"

export const maxDuration = 15

// Our own camera id: `<source>:<sourceId>`. Never a URL.
const idSchema = z
  .string()
  .max(128)
  .regex(/^[a-z0-9]+:[a-z0-9-]+$/, "invalid camera id")

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/cam/[id]/image">
) {
  const limited = enforceRateLimit(request, "cam-image", RATE_LIMITS.image)
  if (limited) return limited

  const { id: rawId } = await ctx.params
  const parsed = idSchema.safeParse(rawId)
  if (!parsed.success) {
    return Response.json({ error: "Invalid camera id" }, { status: 400 })
  }

  const camera = await getCameraById(parsed.data)
  if (!camera) {
    return Response.json({ error: "Camera not found" }, { status: 404 })
  }

  const result = await getCameraImage(camera)
  if (!result.ok) {
    // Mark stale (unless the sync already marked it offline) and serve the
    // placeholder so the UI degrades gracefully.
    if (camera.status !== "offline") {
      await setCameraStatus(camera.id, "stale").catch(() => {})
    }
    return placeholderResponse()
  }

  // If a previously stale camera is serving images again, restore it to live.
  if (camera.status === "stale") {
    await setCameraStatus(camera.id, "live").catch(() => {})
  }

  return new Response(result.bytes as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Content-Length": String(result.bytes.byteLength),
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
    },
  })
}
