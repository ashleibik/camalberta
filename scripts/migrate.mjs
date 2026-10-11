// Apply Drizzle migrations to Postgres (DATABASE_URL) or embedded PGlite.
// Run via `npm run db:migrate`, which loads .env if present.
import { mkdirSync } from "node:fs"
import path from "node:path"

const MIGRATIONS_FOLDER = "drizzle"

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim()

  if (databaseUrl) {
    const { drizzle } = await import("drizzle-orm/postgres-js")
    const { migrate } = await import("drizzle-orm/postgres-js/migrator")
    const postgres = (await import("postgres")).default
    const client = postgres(databaseUrl, { max: 1 })
    const db = drizzle(client)
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
    await client.end()
    console.log("Migrations applied to Postgres.")
    return
  }

  const dataDir = path.resolve(
    process.cwd(),
    process.env.PGLITE_DATA_DIR?.trim() || ".data/pglite"
  )
  // PGlite's own mkdir is not recursive, so ensure the parent exists first.
  mkdirSync(dataDir, { recursive: true })

  const { PGlite } = await import("@electric-sql/pglite")
  const { drizzle } = await import("drizzle-orm/pglite")
  const { migrate } = await import("drizzle-orm/pglite/migrator")
  const db = drizzle({ client: new PGlite(dataDir) })
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  await db.$client.close()
  console.log(`Migrations applied to PGlite at ${dataDir}.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
