import { cameraIdSchema } from "@/lib/camera-id"
import { getCameraById, setCameraStatus } from "@/lib/cameras"
import { getCameraImage, STALE_PHOTO_MS } from "@/lib/proxy/image"
import { placeholderResponse } from "@/lib/proxy/placeholder"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"

export const maxDuration = 15

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

  const now = Date.now()

  // A photo that hasn't changed in a long time means the camera is frozen
  // upstream: report it as stale rather than live.
  const frozen =
    result.lastModified !== null && now - result.lastModified > STALE_PHOTO_MS
  const nextStatus = frozen ? "stale" : "live"
  if (camera.status !== "offline" && camera.status !== nextStatus) {
    await setCameraStatus(camera.id, nextStatus).catch(() => {})
  }

  // Shared caches keep the photo only until the next one is due (max 30s);
  // browsers always revalidate (max-age=0) so they never hold an old frame.
  const sMaxAge = Math.max(1, Math.floor((result.expiresAt - now) / 1000))
  const headers = new Headers({
    "Content-Type": result.contentType,
    "Content-Length": String(result.bytes.byteLength),
    "Cache-Control": `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=5`,
    "X-Snapshot-Interval": String(Math.round(result.intervalMs / 1000)),
  })
  if (result.lastModified !== null) {
    headers.set("Last-Modified", new Date(result.lastModified).toUTCString())
  }
  if (result.nextAt !== null) {
    headers.set("X-Next-Snapshot", new Date(result.nextAt).toISOString())
  }

  return new Response(result.bytes as BodyInit, { status: 200, headers })
}
