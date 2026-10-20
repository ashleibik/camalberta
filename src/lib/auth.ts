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
 * request is rejected. Machine routes only; the admin pages have their own
 * login (`isAdminAuthorized`).
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
 * Admin login (/admin/*): HTTP Basic with ADMIN_USERNAME and ADMIN_PASSWORD.
 * Basic auth lets a browser sign in with no account system; credentials only
 * travel over https in production (HSTS). Both parts are always compared, in
 * constant time, so neither the timing nor the result says which one was
 * wrong. Fails closed when either is unset.
 */
export function isAdminAuthorized(authorization: string | null): boolean {
  const username = env.ADMIN_USERNAME
  const password = env.ADMIN_PASSWORD
  if (!username || !password || !authorization) return false

  const basic = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization.trim())
  if (!basic) return false
  const decoded = Buffer.from(basic[1]!, "base64").toString("utf8")
  const colon = decoded.indexOf(":")
  if (colon < 0) return false

  const usernameOk = safeEqual(decoded.slice(0, colon), username)
  const passwordOk = safeEqual(decoded.slice(colon + 1), password)
  return usernameOk && passwordOk
}

/**
 * Whether the admin pages exist at all. Production: only while ADMIN_ENABLED
 * is "true" (turned on just for labelling sessions). Development: unless it's
 * "false". Never without a configured login.
 */
export function adminEnabled(options: {
  nodeEnv: string
  flag: string | undefined
  configured: boolean
}): boolean {
  if (!options.configured) return false
  const flag = options.flag?.trim().toLowerCase()
  return options.nodeEnv === "production" ? flag === "true" : flag !== "false"
}

export function isAdminEnabled(): boolean {
  return adminEnabled({
    nodeEnv: env.NODE_ENV,
    flag: env.ADMIN_ENABLED,
    configured: Boolean(env.ADMIN_USERNAME && env.ADMIN_PASSWORD),
  })
}

/** The browser's login prompt for /admin. */
export const ADMIN_AUTH_CHALLENGE =
  'Basic realm="CamAlberta admin", charset="UTF-8"'
