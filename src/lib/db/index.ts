import "server-only"

import { mkdirSync } from "node:fs"
import path from "node:path"

import { PGlite } from "@electric-sql/pglite"
import { sql } from "drizzle-orm"
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core"
import { drizzle as drizzlePglite } from "drizzle-orm/pglite"
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { env } from "@/lib/env"

import * as schema from "./schema"

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>

type DbGlobal = typeof globalThis & { __camyycDb?: Database }

function createDb(): Database {
  if (env.DATABASE_URL) {
    // Serverless friendly: few connections, no prepared statements (Neon and
    // Supabase poolers run in transaction mode).
    const client = postgres(env.DATABASE_URL, { max: 5, prepare: false })
    return drizzlePostgres({ client, schema })
  }

  const dataDir = path.resolve(process.cwd(), env.PGLITE_DATA_DIR)
  mkdirSync(dataDir, { recursive: true })
  return drizzlePglite({ client: new PGlite(dataDir), schema })
}

/**
 * Lazily created singleton. Cached on globalThis so dev hot reloads reuse one
 * connection; PGlite in particular must never open the same data dir twice.
 */
export function getDb(): Database {
  const g = globalThis as DbGlobal
  g.__camyycDb ??= createDb()
  return g.__camyycDb
}

export async function pingDb(): Promise<boolean> {
  try {
    await getDb().execute(sql`select 1`)
    return true
  } catch {
    return false
  }
}
