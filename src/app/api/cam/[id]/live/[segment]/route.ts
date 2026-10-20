import { z } from "zod"

import { cameraIdSchema } from "@/lib/camera-id-schema"
import { getCameraById } from "@/lib/cameras"
import { noQuery, parseQuery } from "@/lib/http"
import { isVideoSource } from "@/lib/media"
import { getLiveSegment } from "@/lib/proxy/hls"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"

export const maxDuration = 15

// `<media sequence number>.ts`, as written by our playlist route.
const segmentSchema = z.string().regex(/^\d{1,15}\.ts$/)

/** One live video segment (MPEG-TS), relayed from the camera's stream. */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/cam/[id]/live/[segment]">
) {
  const limited = enforceRateLimit(request, "cam-live", RATE_LIMITS.video)
  if (limited) return limited

  const { id: rawId, segment: rawSegment } = await ctx.params
  const id = cameraIdSchema.safeParse(rawId)
  const segment = segmentSchema.safeParse(rawSegment)
  if (!id.success || !segment.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 })
  }
  const query = parseQuery(request, noQuery)
  if (!query.ok) return query.response
  const seq = Number(segment.data.slice(0, -".ts".length))

  const camera = await getCameraById(id.data)
  if (!camera || !isVideoSource(camera.source)) {
    return Response.json({ error: "Video camera not found" }, { status: 404 })
  }
  const limitedCamera = enforceRateLimit(
    request,
    `cam-live:${camera.id}`,
    RATE_LIMITS.videoPerCamera
  )
  if (limitedCamera) return limitedCamera

  const bytes = await getLiveSegment(camera, seq)
  if (!bytes) {
    return Response.json(
      { error: "Segment not available" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    )
  }

  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "video/mp2t",
      "Content-Length": String(bytes.byteLength),
      // A sequence number always names the same few seconds of video.
      "Cache-Control": "public, max-age=30, immutable",
    },
  })
}
