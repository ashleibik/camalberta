import { z } from "zod"

import { isAdminAuthorized, isAdminEnabled } from "@/lib/auth"
import { getSnapshotImageKey } from "@/lib/collect/review"
import { noQuery, parseQuery } from "@/lib/http"
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit"
import { getSnapshotStorage } from "@/lib/storage/snapshots"

const idSchema = z
  .string()
  .regex(/^\d{1,15}$/)
  .transform(Number)

/**
 * A stored snapshot, for the label page. Under /admin so the browser sends
 * the admin login with it (the proxy checks; so does this route). The image
 * at a key never changes, so the browser may keep it.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/admin/snapshots/[id]/image">
) {
  if (!isAdminEnabled()) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }
  const limited = enforceRateLimit(request, "admin", RATE_LIMITS.admin)
  if (limited) return limited
  if (!isAdminAuthorized(request.headers.get("authorization"))) {
    return new Response("Sign-in required.", { status: 401 })
  }
  const { id } = await ctx.params
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) {
    return Response.json({ error: "Invalid snapshot id" }, { status: 400 })
  }
  const query = parseQuery(request, noQuery)
  if (!query.ok) return query.response

  try {
    const key = await getSnapshotImageKey(parsed.data)
    const bytes = key ? await getSnapshotStorage().get(key) : null
    if (!bytes) {
      return Response.json({ error: "Snapshot not found" }, { status: 404 })
    }
    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    })
  } catch {
    return Response.json({ error: "Couldn't load snapshot" }, { status: 500 })
  }
}
