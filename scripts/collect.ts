// Road condition collection, standalone (Phase 9). Run every 15 minutes by
// .github/workflows/collect.yml:
//
//   npm run collect
//
// Needs DATABASE_URL (Postgres) and the S3_* settings (Cloudflare R2). It
// refuses to run on the local PGlite database unless asked to (--pglite),
// because the dev server holds that database open and PGlite must never be
// opened by two processes; in development use POST /api/collect instead.
//
// Runs with `--conditions=react-server` so our `server-only` modules load
// outside Next.js, and `--import tsx` for TypeScript and the @/ paths.
import { runCollection } from "@/lib/collect/collect"
import { env } from "@/lib/env"

const LOCAL_HELP = [
  "No DATABASE_URL. In local development, run collection through the dev server:",
  '  curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/collect',
  "or stop the dev server and run: npm run collect -- --pglite",
].join("\n")

async function main(): Promise<number> {
  if (!env.DATABASE_URL && !process.argv.includes("--pglite")) {
    console.error(LOCAL_HELP)
    return 1
  }
  const result = await runCollection()
  console.log(JSON.stringify(result))
  // Fail the scheduled run only when nothing at all worked, so one bad camera
  // doesn't page anyone but a broken setup does.
  return result.cameras > 0 && result.failed === result.cameras ? 1 : 0
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    // Name and message only: never connection strings or storage URLs.
    console.error(
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : "Collection failed"
    )
    process.exit(1)
  }
)
