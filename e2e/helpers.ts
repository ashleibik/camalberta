import { expect, type Page } from "@playwright/test"

import savedReport from "./fixtures/trip-banff.json"

// A real /api/trips/banff response, saved after a live 511 sync. Replaying it
// makes the content checks independent of today's roads and of the database
// (CI's is empty).
export const report = savedReport as {
  verdict: { label: string; reasons: Array<{ text: string }> }
  cameras: Array<{ id: string; name: string; km: number }>
}

// A tiny stand-in for camera snapshots, so tests never wait on camera hosts.
export const BLANK_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='9'><rect width='16' height='9' fill='#333'/></svg>"

export async function stubSnapshots(page: Page) {
  await page.route("**/api/cam/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: BLANK_SVG,
    })
  )
}

/**
 * Show the saved Banff report. The first trip a page shows is rendered on
 * the server from the database, so start on another trip and switch: the
 * picker loads Banff through /api/trips/banff, which is replayed here.
 */
export async function showSavedBanffReport(page: Page) {
  await page.route("**/api/trips/banff", (route) =>
    route.fulfill({ json: savedReport })
  )
  await stubSnapshots(page)
  await page.goto("/trip?to=canmore")
  await expect(page.getByTestId("verdict-card")).toBeVisible()
  await page.getByRole("radio", { name: "Calgary to Banff" }).click()
  await expect(page.getByTestId("verdict-card")).toContainText(
    report.verdict.reasons[0]!.text
  )
}
