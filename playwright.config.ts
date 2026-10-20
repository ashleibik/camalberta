import { defineConfig, devices } from "@playwright/test"

// End-to-end smoke tests (npm run test:e2e). Reuses a dev server that's
// already running on :3000; otherwise starts one (with migrations applied).
// Only one server may use a PGlite folder at a time: never point these at a
// second server with the same PGLITE_DATA_DIR.
const PORT = Number(process.env.E2E_PORT ?? 3000)

// The admin tests sign in with CRON_SECRET, which the dev server reads from
// .env; read it the same way (variables already set win).
try {
  process.loadEnvFile()
} catch {
  // No .env (CI sets its variables directly).
}

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  // The dev server compiles pages on first request; a couple of browsers at
  // a time keeps it responsive.
  workers: 2,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    // Mobile first: people check this on their phone before leaving.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run db:migrate && npm run dev",
    url: `http://localhost:${PORT}/trip`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
