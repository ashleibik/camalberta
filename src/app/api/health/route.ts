import { getHealth } from "@/lib/queries"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"

export const maxDuration = 15

export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "health", RATE_LIMITS.api)
  if (limited) return limited

  try {
    const health = await getHealth()
    return Response.json(health, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return Response.json({ error: "Health check failed" }, { status: 500 })
  }
}
