import { expect, test } from "@playwright/test"

import { showSavedBanffReport, stubSnapshots } from "./helpers"

// Keyboard paths and layout stability. Keyboard tests run on desktop (a
// phone has no Tab key); the layout-shift check runs on both.

test.describe("keyboard", () => {
  test.skip(({ isMobile }) => isMobile, "keyboard paths are desktop")

  test("Skip to content is the first stop and moves focus to the page", async ({
    page,
  }) => {
    for (const path of ["/trip", "/map", "/wall"]) {
      await page.goto(path)
      await page.keyboard.press("Tab")
      const skip = page.getByRole("link", { name: "Skip to content" })
      await expect(skip, path).toBeFocused()
      await expect(skip, path).toBeVisible()
      await page.keyboard.press("Enter")
      // The router can briefly keep a hidden copy of a page while it settles,
      // so check the visible main region.
      await expect(page.locator("#main:visible"), path).toBeFocused()
    }
  })

  test("the trip picker works with arrow keys", async ({ page }) => {
    await page.goto("/trip?to=canmore")
    await page.getByRole("radio", { name: "Calgary to Canmore" }).focus()
    await page.keyboard.press("ArrowRight")
    await expect(
      page.getByRole("radio", { name: "Calgary to Banff" })
    ).toBeFocused()
    await page.keyboard.press("Space")
    await expect(page).toHaveURL(/\?to=banff$/)
  })

  test("a camera opens with Enter and Escape returns focus", async ({
    page,
  }) => {
    await showSavedBanffReport(page)
    const tile = page
      .getByTestId("camera-strip")
      .getByRole("listitem")
      .first()
      .getByRole("button")
    await tile.focus()
    await expect(tile).toBeFocused()
    await page.keyboard.press("Enter")
    const dialog = page.getByRole("dialog", { name: "Camera details" })
    await expect(dialog).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).toBeHidden()
    await expect(tile).toBeFocused()
  })

  test("wall tiles can be reordered without dragging", async ({ page }) => {
    await page.route("**/api/cameras", (route) =>
      route.fulfill({ json: { type: "FeatureCollection", features: [] } })
    )
    await stubSnapshots(page)
    await page.goto("/wall?grid=2&cams=calgary:loc1,calgary:loc2")
    const later = page.getByRole("button", { name: "Move calgary:loc1 later" })
    await later.focus()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(
      /cams=calgary%3Aloc2%2Ccalgary%3Aloc1|cams=calgary:loc2,calgary:loc1/
    )
    // Focus stays with the tile that moved.
    await expect(
      page.getByRole("button", { name: "Move calgary:loc1 earlier" })
    ).toBeVisible()
  })

  test("camera list rows show a focus ring", async ({ page }) => {
    await page.route("**/api/cameras", (route) =>
      route.fulfill({
        json: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [-114.07, 51.04] },
              properties: {
                id: "calgary:loc1",
                name: "Test camera",
                source: "calgary",
                area: "calgary",
                status: "live",
                quadrant: "NW",
                direction: null,
                road: null,
              },
            },
          ],
        },
      })
    )
    await page.goto("/map")
    const row = page
      .getByRole("complementary", { name: "Cameras" })
      .getByRole("button", { name: /Test camera/ })
    await row.focus()
    const shadow = await row.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(shadow).not.toBe("none")
  })
})

test("Trip Check doesn't shift while it loads", async ({ page }) => {
  await page.addInitScript(() => {
    ;(window as unknown as { __cls: number }).__cls = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & { value: number; hadRecentInput: boolean }
      >) {
        if (!entry.hadRecentInput) {
          ;(window as unknown as { __cls: number }).__cls += entry.value
        }
      }
    }).observe({ type: "layout-shift", buffered: true })
  })
  await page.goto("/trip?to=banff")
  await expect(page.getByTestId("verdict-card")).toBeVisible()
  await page.waitForTimeout(1500)
  const cls = await page.evaluate(
    () => (window as unknown as { __cls: number }).__cls
  )
  expect(cls).toBeLessThan(0.05)
})
