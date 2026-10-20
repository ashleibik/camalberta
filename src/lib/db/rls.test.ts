import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { PGlite } from "@electric-sql/pglite"
import { getTableName, is } from "drizzle-orm"
import { PgTable } from "drizzle-orm/pg-core"
import { drizzle } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import { afterEach, describe, expect, it } from "vitest"

import * as schema from "./schema"

// Supabase exposes tables in `public` through its Data API to the `anon` and
// `authenticated` roles. Every table must have row level security on, and
// those roles no privileges. The app connects as the tables' owner, which
// RLS doesn't apply to, so it keeps full access. These tests fail CI if a
// new table forgets to enable RLS.

const MIGRATIONS = fileURLToPath(new URL("../../../drizzle", import.meta.url))
const LOCKDOWN = readFileSync(`${MIGRATIONS}/0004_rls_lockdown.sql`, "utf8")

const SCHEMA_TABLES = Object.values(schema)
  .filter((value) => is(value, PgTable))
  .map((table) => getTableName(table as PgTable))
  .sort()

let client: PGlite | undefined
afterEach(async () => {
  await client?.close()
  client = undefined
})

async function rows<T>(sql: string): Promise<T[]> {
  return (await client!.query<T>(sql)).rows
}

describe("row level security", () => {
  it("is on for every public table after the migrations", async () => {
    client = new PGlite()
    await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS })

    const tables = await rows<{ name: string; rls: boolean }>(`
      select c.relname as name, c.relrowsecurity as rls
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
      order by 1`)
    // Every table the schema declares exists, so none can be missed here.
    expect(tables.map((t) => t.name)).toEqual(SCHEMA_TABLES)
    expect(tables.filter((t) => !t.rls).map((t) => t.name)).toEqual([])
  })

  it("locks Supabase's Data API roles out, but not the owner", async () => {
    client = new PGlite()
    // Like Supabase: the API roles exist and get default grants on every
    // new table in public; migrations run as a non-superuser owner.
    await client.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role app_owner nologin;
      grant usage on schema public to anon, authenticated;
      grant usage, create on schema public to app_owner;
      grant create on database postgres to app_owner;
      alter default privileges for role app_owner in schema public
        grant all on tables to anon, authenticated;
      alter default privileges for role app_owner in schema public
        grant all on sequences to anon, authenticated;
      set role app_owner;`)
    await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS })
    // Running the lockdown again changes nothing and doesn't fail.
    await client.exec(LOCKDOWN)

    // The owner (our app) reads and writes as before.
    await client.exec(`
      insert into cameras (id, source, source_id, name, area, lat, lng, image_url)
      values ('calgary:loc1', 'calgary', 'loc1', 'Test', 'calgary', 51, -114,
              'https://trafficcam.calgary.ca/loc1.jpg');
      insert into admin_login_failures (key, failures, window_started_at)
      values ('203.0.113.7', 1, now());`)
    expect(await rows("select id from cameras")).toHaveLength(1)

    // The API roles have no privilege on any table or sequence...
    const granted = await rows<{ role: string; name: string }>(`
      select r.rolname as role, c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('anon'), ('authenticated')) as r(rolname)
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'S')
        and (has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE')
             or (c.relkind = 'S' and has_sequence_privilege(r.rolname, c.oid, 'USAGE')))`)
    expect(granted).toEqual([])

    // ...so reading or writing as them is refused.
    await client.exec("set role anon")
    await expect(client.query("select * from cameras")).rejects.toThrow(
      /permission denied/
    )
    await expect(
      client.query("delete from push_subscriptions")
    ).rejects.toThrow(/permission denied/)

    // Tables created later get no API grants either.
    await client.exec(`
      set role app_owner;
      create table public.future_table (id int primary key);`)
    expect(
      await rows(
        "select 1 from pg_class where relname = 'future_table' and has_table_privilege('anon', oid, 'SELECT')"
      )
    ).toEqual([])
  })
})
