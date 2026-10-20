import "server-only"

import { ADMIN_AUTH_CHALLENGE } from "@/lib/auth"
import { env } from "@/lib/env"

import {
  isLocked,
  lockoutKey,
  MAX_FAILURES,
  memoryLockoutStore,
  type LockoutStore,
} from "./lockout"

/** On every /admin response: never cached, never indexed. */
export const ADMIN_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
} as const

export interface AdminLoginDeps {
  authorize: (authorization: string | null) => boolean
  /** Lazy: only requests that carry credentials touch the store. */
  store: () => Promise<LockoutStore>
  ip: string
  now: Date
  log: (message: string) => void
}

function text(body: string, status: number, headers: HeadersInit = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      ...ADMIN_RESPONSE_HEADERS,
      ...headers,
    },
  })
}

const signInRequired = () =>
  text("Sign-in required.", 401, { "WWW-Authenticate": ADMIN_AUTH_CHALLENGE })

function lockedOut(until: Date, now: Date) {
  const seconds = Math.max(
    1,
    Math.ceil((until.getTime() - now.getTime()) / 1000)
  )
  const minutes = Math.ceil(seconds / 60)
  return text(
    `Too many failed sign-ins. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    429,
    { "Retry-After": String(seconds) }
  )
}

const unavailable = () =>
  text("Sign-in is unavailable right now. Try again shortly.", 503)

// Header values can't hold newlines, but keep log lines boring regardless.
const forLog = (ip: string) => ip.replace(/[^\w.:%/[\]-]/g, "?").slice(0, 64)

/**
 * The admin login check, run by the proxy on every /admin request. Returns
 * the response to send, or null to let the request through.
 *
 * - No credentials: 401 with the Basic challenge (the browser then asks).
 *   Not counted as a failure: that's how every visit starts.
 * - Address locked out: 429 with Retry-After, before the credentials are
 *   even checked, so guessing can't continue during a lockout.
 * - Wrong credentials: counted and logged; the MAX_FAILURES-th locks the
 *   address (an IPv6 /64) for 15 minutes.
 * - Right credentials: the address's failure record is cleared.
 * - Lockout store down: 503 (fails closed).
 */
export async function checkAdminLogin(
  authorization: string | null,
  deps: AdminLoginDeps
): Promise<Response | null> {
  if (!authorization) return signInRequired()

  const key = lockoutKey(deps.ip)
  try {
    const store = await deps.store()
    const state = await store.get(key)
    if (state?.lockedUntil && isLocked(state, deps.now)) {
      return lockedOut(state.lockedUntil, deps.now)
    }

    if (deps.authorize(authorization)) {
      if (state) await store.clear(key)
      return null
    }

    const after = await store.recordFailure(key, deps.now)
    deps.log(
      `[admin] failed sign-in from ${forLog(deps.ip)} (${after.failures} of ${MAX_FAILURES})`
    )
    if (after.lockedUntil && isLocked(after, deps.now)) {
      deps.log(
        `[admin] ${forLog(key)} locked out until ${after.lockedUntil.toISOString()} after ${MAX_FAILURES} failed sign-ins`
      )
      return lockedOut(after.lockedUntil, deps.now)
    }
    return signInRequired()
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error"
    console.error(`[admin] lockout store failed: ${name}`)
    return unavailable()
  }
}

type LockoutGlobal = typeof globalThis & {
  __camalbertaAdminLockout?: LockoutStore
}

/**
 * Postgres in production (shared by every instance), memory with local
 * PGlite (one process; and the proxy must never open PGlite itself).
 */
export async function getLockoutStore(): Promise<LockoutStore> {
  if (env.DATABASE_URL) {
    const [{ dbLockoutStore }, { getDb }] = await Promise.all([
      import("./lockout-db"),
      import("@/lib/db"),
    ])
    return dbLockoutStore(getDb())
  }
  const g = globalThis as LockoutGlobal
  g.__camalbertaAdminLockout ??= memoryLockoutStore()
  return g.__camalbertaAdminLockout
}
