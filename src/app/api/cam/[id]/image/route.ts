import { z } from "zod"

import { cameraIdSchema } from "@/lib/camera-id-schema"
import { getCameraById, setCameraStatus } from "@/lib/cameras"
import { parseQuery } from "@/lib/http"
import { isVideoSource } from "@/lib/media"
import { getCameraImage, STALE_PHOTO_MS } from "@/lib/proxy/image"
import { placeholderResponse } from "@/lib/proxy/placeholder"
import { getThumbnail } from "@/lib/proxy/thumbnail"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"

export const maxDuration = 15

// `t`: shared 30s cache bucket. `refresh=1` (+ a unique `r` so caches don't
// answer it): the refresh button asking us to check upstream right now.
// `w=320`: a small thumbnail (the only size offered). Strict: any other
// parameter is a 400.
const querySchema = z.strictObject({
  t: z
    .string()
    .regex(/^\d{1,15}$/)
    .optional(),
  refresh: z.literal("1").optional(),
  r: z
    .string()
    .regex(/^\d{1,15}$/)
    .optional(),
  w: z.literal("320").optional(),
})

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/cam/[id]/image">
) {
  const limited = enforceRateLimit(request, "cam-image", RATE_LIMITS.image)
  if (limited) return limited

  const { id: rawId } = await ctx.params
  const parsed = cameraIdSchema.safeParse(rawId)
  if (!parsed.success) {
    return Response.json({ error: "Invalid camera id" }, { status: 400 })
  }

  const query = parseQuery(request, querySchema)
  if (!query.ok) return query.response

  const camera = await getCameraById(parsed.data)
  if (!camera) {
    return Response.json({ error: "Camera not found" }, { status: 404 })
  }
  // Per-camera cap, keyed only by cameras that exist (bounded key space).
  const limitedCamera = enforceRateLimit(
    request,
    `cam-image:${camera.id}`,
    RATE_LIMITS.imagePerCamera
  )
  if (limitedCamera) return limitedCamera

  if (isVideoSource(camera.source)) {
    // Video cameras are served by /api/cam/[id]/live instead.
    return Response.json(
      { error: "This camera is a live video stream" },
      { status: 404 }
    )
  }

  const result = await getCameraImage(camera, fetch, {
    force: query.data.refresh === "1",
  })
  if (!result.ok) {
    // Mark stale (unless the sync already marked it offline) and serve the
    // placeholder so the UI degrades gracefully.
    if (camera.status !== "offline") {
      await setCameraStatus(camera.id, "stale").catch(() => {})
    }
    return placeholderResponse()
  }

  const now = Date.now()

  // A photo that hasn't changed in a long time means the camera is frozen
  // upstream: report it as stale rather than live.
  const frozen =
    result.lastModified !== null && now - result.lastModified > STALE_PHOTO_MS
  const nextStatus = frozen ? "stale" : "live"
  if (camera.status !== "offline" && camera.status !== nextStatus) {
    await setCameraStatus(camera.id, nextStatus).catch(() => {})
  }

  // A thumbnail is resized once per photo (see thumbnail.ts) and cached
  // exactly like the photo. If resizing fails, serve the full photo.
  const thumbnail =
    query.data.w === "320" ? await getThumbnail(camera.id, result.bytes) : null
  const body = thumbnail ?? result.bytes
  const contentType = thumbnail ? "image/jpeg" : result.contentType

  // Shared caches keep the photo only until the next one is due (max 30s);
  // browsers always revalidate (max-age=0) so they never hold an old frame.
  const sMaxAge = Math.max(1, Math.floor((result.expiresAt - now) / 1000))
  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Length": String(body.byteLength),
    "Cache-Control": `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=5`,
    "X-Snapshot-Interval": String(Math.round(result.intervalMs / 1000)),
  })
  if (result.lastModified !== null) {
    headers.set("Last-Modified", new Date(result.lastModified).toUTCString())
  }
  if (result.nextAt !== null) {
    headers.set("X-Next-Snapshot", new Date(result.nextAt).toISOString())
  }

  return new Response(body as BodyInit, { status: 200, headers })
}
