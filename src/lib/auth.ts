import "server-only"

import { createHash, timingSafeEqual } from "node:crypto"

import { env } from "@/lib/env"

/** Constant-time string compare via fixed-length SHA-256 digests. */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest()
  const hb = createHash("sha256").update(b).digest()
  return timingSafeEqual(ha, hb)
}

/**
 * Check a request against CRON_SECRET. Accepts `Authorization: Bearer <secret>`
 * (what Vercel Cron sends). Fails closed: if CRON_SECRET is unset, every
 * request is rejected.
 */
export function isAuthorized(request: Request): boolean {
  const secret = env.CRON_SECRET
  if (!secret) return false

  const header = request.headers.get("authorization") ?? ""
  const match = /^Bearer (.+)$/.exec(header)
  if (!match) return false

  return safeEqual(match[1]!, secret)
}
