import "server-only"

import { constantTimeEqual, verifyPassword } from "@/lib/admin/password"
import { env } from "@/lib/env"

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

  return constantTimeEqual(match[1]!, secret)
}

/** Logins verified in the last minute (a page loads many images). */
const recentLogins = new Map<string, number>()
const RECENT_LOGIN_MS = 60_000
const MAX_RECENT_LOGINS = 16

/**
 * Admin login (/admin/*): HTTP Basic with ADMIN_USERNAME and a password
 * checked against ADMIN_PASSWORD_HASH (scrypt, see admin/password.ts).
 * Basic auth lets a browser sign in with no account system; credentials only
 * travel over https in production (HSTS). The username compare is constant
 * time and the scrypt check always runs, so neither timing nor result says
 * which part was wrong. A login that verified in the last minute is
 * accepted without re-running scrypt (the proxy's lockout still applies to
 * every request). Fails closed when either setting is unset.
 */
export async function isAdminAuthorized(
  authorization: string | null
): Promise<boolean> {
  const username = env.ADMIN_USERNAME
  const passwordHash = env.ADMIN_PASSWORD_HASH
  if (!username || !passwordHash || !authorization) return false

  const header = authorization.trim()
  const now = Date.now()
  const verifiedUntil = recentLogins.get(header)
  if (verifiedUntil !== undefined && verifiedUntil > now) return true

  const basic = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header)
  if (!basic) return false
  const decoded = Buffer.from(basic[1]!, "base64").toString("utf8")
  const colon = decoded.indexOf(":")
  if (colon < 0) return false

  const usernameOk = constantTimeEqual(decoded.slice(0, colon), username)
  const passwordOk = await verifyPassword(
    decoded.slice(colon + 1),
    passwordHash
  )
  if (!(usernameOk && passwordOk)) return false

  recentLogins.delete(header)
  recentLogins.set(header, now + RECENT_LOGIN_MS)
  while (recentLogins.size > MAX_RECENT_LOGINS) {
    recentLogins.delete(recentLogins.keys().next().value!)
  }
  return true
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
    configured: Boolean(env.ADMIN_USERNAME && env.ADMIN_PASSWORD_HASH),
  })
}

/** The browser's login prompt for /admin. */
export const ADMIN_AUTH_CHALLENGE =
  'Basic realm="CamAlberta admin", charset="UTF-8"'
