import { defineConfig } from "drizzle-kit"

const databaseUrl = process.env.DATABASE_URL?.trim()

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  ...(databaseUrl
    ? { dbCredentials: { url: databaseUrl } }
    : {
        driver: "pglite",
        dbCredentials: { url: process.env.PGLITE_DATA_DIR ?? ".data/pglite" },
      }),
})
