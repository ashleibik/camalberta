import "server-only"

import { and, eq, isNull, lt, or, sql } from "drizzle-orm"

import type { Database } from "@/lib/db"
import { adminLoginFailures as t } from "@/lib/db/schema"

import {
  LOCKOUT_MS,
  MAX_FAILURES,
  WINDOW_MS,
  type LockoutStore,
} from "./lockout"

const PRUNE_AFTER_MS = 24 * 60 * 60_000

const ts = (date: Date) => sql`${date.toISOString()}::timestamptz`

/**
 * Lockout records in Postgres, shared by every server instance. Each failure
 * is one atomic upsert, so concurrent requests can't lose a count.
 */
export function dbLockoutStore(db: Database): LockoutStore {
  return {
    async get(key) {
      const [row] = await db
        .select({ failures: t.failures, lockedUntil: t.lockedUntil })
        .from(t)
        .where(eq(t.key, key))
      return row ?? null
    },

    async recordFailure(key, now) {
      // The window restarts when its first failure is older than WINDOW_MS.
      const expired = sql`${t.windowStartedAt} < ${ts(new Date(now.getTime() - WINDOW_MS))}`
      const failures = sql`case when ${expired} then 1 else ${t.failures} + 1 end`
      const lockUntil = new Date(now.getTime() + LOCKOUT_MS)
      const [row] = await db
        .insert(t)
        .values({
          key,
          failures: 1,
          windowStartedAt: now,
          lockedUntil: MAX_FAILURES <= 1 ? lockUntil : null,
        })
        .onConflictDoUpdate({
          target: t.key,
          set: {
            failures,
            windowStartedAt: sql`case when ${expired} then ${ts(now)} else ${t.windowStartedAt} end`,
            lockedUntil: sql`case when ${failures} >= ${MAX_FAILURES} then ${ts(lockUntil)} else ${t.lockedUntil} end`,
          },
        })
        .returning({ failures: t.failures, lockedUntil: t.lockedUntil })

      // Prune records nobody has used for a day.
      const stale = new Date(now.getTime() - PRUNE_AFTER_MS)
      await db
        .delete(t)
        .where(
          and(
            lt(t.windowStartedAt, stale),
            or(isNull(t.lockedUntil), lt(t.lockedUntil, now))
          )
        )

      return row ?? { failures: 1, lockedUntil: null }
    },

    async clear(key) {
      await db.delete(t).where(eq(t.key, key))
    },
  }
}
