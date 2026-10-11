import { cameraIdSchema } from "@/lib/camera-id"
import { getCameraById } from "@/lib/cameras"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { toPublicCamera } from "@/lib/serialize"

export const maxDuration = 15

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/cameras/[id]">
) {
  const limited = enforceRateLimit(request, "camera", RATE_LIMITS.api)
  if (limited) return limited

  const { id } = await ctx.params
  const parsed = cameraIdSchema.safeParse(id)
  if (!parsed.success) {
    return Response.json({ error: "Invalid camera id" }, { status: 400 })
  }

  const camera = await getCameraById(parsed.data)
  if (!camera) {
    return Response.json({ error: "Camera not found" }, { status: 404 })
  }

  return Response.json(toPublicCamera(camera), {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    },
  })
}
