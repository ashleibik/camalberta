import { getCamerasGeoJSON } from "@/lib/queries"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"

export const maxDuration = 15

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "cameras", RATE_LIMITS.api)
  if (limited) return limited

  const data = await getCamerasGeoJSON()
  return Response.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  })
}
