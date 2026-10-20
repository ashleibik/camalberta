/**
 * Admin sign-in lockout: after MAX_FAILURES wrong logins within WINDOW_MS,
 * the address is refused for LOCKOUT_MS, even with the right password. A
 * successful login clears its record.
 *
 * Pure rules and an in-memory store here (local development: one process);
 * production keeps the records in Postgres (lockout-db.ts), so every server
 * instance sees the same count and a cold start doesn't forget a lockout.
 */

export const MAX_FAILURES = 5
export const WINDOW_MS = 15 * 60_000
export const LOCKOUT_MS = 15 * 60_000

export interface LockoutState {
  failures: number
  lockedUntil: Date | null
}

export interface LockoutStore {
  /** The address's current record, or null if it has none. */
  get(key: string): Promise<LockoutState | null>
  /** Count a failed login; locks the address on the MAX_FAILURES-th. */
  recordFailure(key: string, now: Date): Promise<LockoutState>
  /** Forget the address (after a successful login). */
  clear(key: string): Promise<void>
}

export function isLocked(state: LockoutState | null, now: Date): boolean {
  return state?.lockedUntil != null && state.lockedUntil > now
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

function expandIpv6(ip: string): string[] | null {
  const halves = ip.split("::")
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(":") : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  const groups = [...head, ...Array<string>(missing).fill("0"), ...tail]
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null
  return groups.map((g) => g.replace(/^0+(?=.)/, ""))
}

/**
 * Who a lockout applies to. IPv4: the address. IPv6: its /64, because one
 * home or server connection usually gets a whole /64 and could otherwise
 * switch addresses after every lockout. Anything else (e.g. "unknown" when
 * there's no proxy header locally) is used as given, capped in length.
 */
export function lockoutKey(ip: string): string {
  const value = ip
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value)
  if (mapped) return mapped[1]!
  if (IPV4.test(value)) return value
  if (value.includes(":")) {
    const groups = expandIpv6(value.split("%")[0]!)
    if (groups) return `${groups.slice(0, 4).join(":")}::/64`
  }
  return value.slice(0, 64) || "unknown"
}

interface MemoryEntry {
  failures: number
  windowStart: number
  lockedUntil: number | null
}

const MAX_MEMORY_ENTRIES = 10_000

/** Single-process store (development, tests). */
export function memoryLockoutStore(): LockoutStore {
  const entries = new Map<string, MemoryEntry>()
  const toState = (e: MemoryEntry): LockoutState => ({
    failures: e.failures,
    lockedUntil: e.lockedUntil === null ? null : new Date(e.lockedUntil),
  })
  return {
    async get(key) {
      const entry = entries.get(key)
      return entry ? toState(entry) : null
    },
    async recordFailure(key, now) {
      const t = now.getTime()
      const previous = entries.get(key)
      const fresh = !previous || previous.windowStart < t - WINDOW_MS
      const failures = fresh ? 1 : previous.failures + 1
      const entry: MemoryEntry = {
        failures,
        windowStart: fresh ? t : previous.windowStart,
        lockedUntil:
          failures >= MAX_FAILURES
            ? t + LOCKOUT_MS
            : (previous?.lockedUntil ?? null),
      }
      entries.delete(key)
      entries.set(key, entry)
      if (entries.size > MAX_MEMORY_ENTRIES) {
        // Drop finished records first, then the oldest.
        for (const [k, e] of entries) {
          if (e.windowStart < t - WINDOW_MS && (e.lockedUntil ?? 0) < t) {
            entries.delete(k)
          }
        }
        while (entries.size > MAX_MEMORY_ENTRIES) {
          const oldest = entries.keys().next().value
          if (oldest === undefined) break
          entries.delete(oldest)
        }
      }
      return toState(entry)
    },
    async clear(key) {
      entries.delete(key)
    },
  }
}
