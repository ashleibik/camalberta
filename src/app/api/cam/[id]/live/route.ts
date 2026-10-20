import { after } from "next/server"

import { cameraIdSchema } from "@/lib/camera-id-schema"
import { getCameraById, setCameraStatus } from "@/lib/cameras"
import { noQuery, parseQuery } from "@/lib/http"
import { isVideoSource } from "@/lib/media"
import { getLivePlaylist, renderPlaylist } from "@/lib/proxy/hls"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"

export const maxDuration = 15

const NO_STORE = { "Cache-Control": "no-store" }

/** Live HLS playlist for a video camera, rewritten to point at our segments. */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/cam/[id]/live">
) {
  const limited = enforceRateLimit(request, "cam-live", RATE_LIMITS.video)
  if (limited) return limited

  const { id: rawId } = await ctx.params
  const parsed = cameraIdSchema.safeParse(rawId)
  if (!parsed.success) {
    return Response.json({ error: "Invalid camera id" }, { status: 400 })
  }
  const query = parseQuery(request, noQuery)
  if (!query.ok) return query.response

  const camera = await getCameraById(parsed.data)
  if (!camera || !isVideoSource(camera.source)) {
    return Response.json({ error: "Video camera not found" }, { status: 404 })
  }
  const limitedCamera = enforceRateLimit(
    request,
    `cam-live:${camera.id}`,
    RATE_LIMITS.videoPerCamera
  )
  if (limitedCamera) return limitedCamera

  const result = await getLivePlaylist(camera)
  if (!result.ok) {
    if (camera.status === "live") {
      await setCameraStatus(camera.id, "stale").catch(() => {})
    }
    return Response.json(
      { error: "Stream unavailable" },
      { status: 502, headers: NO_STORE }
    )
  }
  if (camera.status === "stale") {
    await setCameraStatus(camera.id, "live").catch(() => {})
  }

  // Let the newest segments finish caching after the response is sent.
  after(() => result.prefetch)

  const base = `/api/cam/${encodeURIComponent(camera.id)}/live`
  const body = renderPlaylist(result.playlist, (seq) => `${base}/${seq}.ts`)
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      // Identical for every viewer and only changes every ~2s: a shared
      // cache may serve it for 1s, so a crowd of viewers (one school
      // network, one IP) costs us about one request per second per stream.
      "Cache-Control": "public, max-age=0, s-maxage=1",
    },
  })
}
