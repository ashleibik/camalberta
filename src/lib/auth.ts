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

/**
 * Admin pages (/admin/*): HTTP Basic auth with CRON_SECRET as the password
 * (any user name), or the same Bearer secret as the cron routes. Basic auth
 * lets a browser log in with no account system; credentials only travel over
 * https in production (HSTS). Fails closed like `isAuthorized`.
 */
export function isAdminAuthorized(authorization: string | null): boolean {
  const secret = env.CRON_SECRET
  if (!secret || !authorization) return false

  const bearer = /^Bearer (.+)$/.exec(authorization)
  if (bearer) return safeEqual(bearer[1]!, secret)

  const basic = /^Basic ([A-Za-z0-9+/]+={0,2})$/.exec(authorization)
  if (!basic) return false
  const decoded = Buffer.from(basic[1]!, "base64").toString("utf8")
  const colon = decoded.indexOf(":")
  if (colon < 0) return false
  return safeEqual(decoded.slice(colon + 1), secret)
}

/** The browser's login prompt for /admin. */
export const ADMIN_AUTH_CHALLENGE =
  'Basic realm="CamAlberta admin", charset="UTF-8"'
