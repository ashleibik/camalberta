import { expect, test } from "@playwright/test"

import { report, showSavedBanffReport } from "./helpers"

const VERDICT_LABELS =
  /^(Looks good|Drive carefully|Check before you go|Can't confirm)$/

test("/trip?to=banff shows a verdict card and the camera strip", async ({
  page,
}) => {
  await page.goto("/trip?to=banff")

  const card = page.getByTestId("verdict-card")
  await expect(card).toBeVisible()
  await expect(card.getByRole("heading", { level: 2 })).toHaveText(
    VERDICT_LABELS
  )
  await expect(card).toContainText("Calgary to Banff")

  await expect(page.getByTestId("camera-strip")).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Cameras on the way" })
  ).toBeVisible()

  await expect(
    page.getByRole("radio", { name: "Calgary to Banff" })
  ).toHaveAttribute("aria-checked", "true")
  await expect(
    page.getByText("This is a guide, not a safety guarantee.", { exact: false })
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "official 511 Alberta" })
  ).toHaveAttribute("href", "https://511.alberta.ca/")
})

test("shows reasons and cameras in driving order from real 511 data", async ({
  page,
}) => {
  await showSavedBanffReport(page)

  const card = page.getByTestId("verdict-card")
  await expect(card.getByRole("heading", { level: 2 })).toHaveText(
    report.verdict.label
  )
  await expect(card).toContainText(report.verdict.reasons[0]!.text)

  const tiles = page.getByTestId("camera-strip").getByRole("listitem")
  await expect(tiles).toHaveCount(report.cameras.length)
  const kms = (await tiles.allInnerTexts()).map((text) =>
    Number(/km (\d+)/.exec(text)?.[1])
  )
  expect(kms).toEqual([...kms].sort((a, b) => a - b))
})

test("tapping a camera opens the camera detail panel", async ({ page }) => {
  await showSavedBanffReport(page)

  const first = report.cameras[0]!
  const tile = page.getByTestId("camera-strip").getByRole("listitem").first()
  await expect(tile).toContainText(first.name)
  await tile.getByRole("button").click()
  await expect(
    page.getByRole("dialog", { name: "Camera details" })
  ).toBeVisible()
  await expect(page).toHaveURL(/[?&]cam=/)
})

test("the trip picker switches trips and saves it in the URL", async ({
  page,
}) => {
  await page.goto("/trip?to=banff")
  await page.getByRole("radio", { name: "Calgary to Edmonton" }).click()
  await expect(page).toHaveURL(/\/trip\?to=edmonton$/)
  await expect(page.getByTestId("verdict-card")).toContainText(
    "Calgary to Edmonton"
  )
})

test("Trip Check is the homepage and the camera map is one click away", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page).toHaveURL(/\/trip$/)
  await page
    .getByRole("link", { name: /Map|Camera map/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/map$/)
  await expect(page.getByRole("link", { name: /Trip/ }).first()).toBeVisible()
})

test("old camera links still open the map", async ({ page }) => {
  await page.goto("/?cam=calgary:loc65")
  await expect(page).toHaveURL(/\/map\?cam=/)
  // The redirect may percent-encode the colon; the app decodes it.
  expect(new URL(page.url()).searchParams.get("cam")).toBe("calgary:loc65")
})
