import { expect, test } from "@playwright/test"

// Phase 9: the label page and everything under /admin need the admin login
// (HTTP Basic, CRON_SECRET as the password) and fail closed without it.

const SECRET = process.env.CRON_SECRET

const basic = (password: string) =>
  `Basic ${Buffer.from(`admin:${password}`).toString("base64")}`

test("admin pages and collection require the secret", async ({
  request,
  isMobile,
}) => {
  test.skip(isMobile, "API checks run once")
  for (const path of ["/admin", "/admin/label", "/admin/snapshots/1/image"]) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(401)
    expect(response.headers()["www-authenticate"], path).toMatch(
      /^Basic realm="CamAlberta admin"/
    )
    expect(response.headers()["cache-control"], path).toBe("no-store")
  }
  const wrong = await request.get("/admin/label", {
    headers: { authorization: basic("not-the-secret-not-the-secret-00") },
  })
  expect(wrong.status()).toBe(401)
  expect((await request.post("/api/collect")).status()).toBe(401)
})

test.describe("signed in", () => {
  test.skip(!SECRET, "needs CRON_SECRET (in .env locally, set in CI)")
  test.use({ httpCredentials: { username: "admin", password: SECRET ?? "" } })

  test("the snapshot image route validates its id", async ({
    request,
    isMobile,
  }) => {
    test.skip(isMobile, "API checks run once")
    const headers = { authorization: basic(SECRET ?? "") }
    const bad = await request.get("/admin/snapshots/abc/image", { headers })
    expect(bad.status()).toBe(400)
    const missing = await request.get("/admin/snapshots/999999999/image", {
      headers,
    })
    expect(missing.status()).toBe(404)
    const query = await request.get("/admin/snapshots/1/image?x=1", {
      headers,
    })
    expect(query.status()).toBe(400)
  })

  test("the label page lists snapshots or explains it's empty", async ({
    page,
  }) => {
    await page.goto("/admin/label")
    await expect(
      page.getByRole("heading", { level: 1, name: "Label road conditions" })
    ).toBeVisible()
    const cards = page.locator("article")
    const empty = page.getByText("No snapshots yet")
    await expect(cards.first().or(empty)).toBeVisible()
  })

  test("labels a snapshot from the keyboard and undoes it", async ({
    page,
    isMobile,
  }) => {
    // One project only: both would change the same snapshot.
    test.skip(isMobile, "runs once")
    await page.goto("/admin/label")
    const card = page.locator("article").first()
    const hasCards = await card
      .waitFor({ timeout: 5_000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasCards, "no unreviewed snapshots in this database")

    // The photo comes from storage through the authenticated route.
    const image = card.locator("img")
    const src = await image.getAttribute("src")
    expect(src).toMatch(/^\/admin\/snapshots\/\d+\/image$/)
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0)

    await card.focus()
    await page.keyboard.press("1")
    await expect(card.getByText("Reviewed", { exact: true })).toBeVisible()
    await expect(card.getByRole("button", { name: "Dry" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    // Wait for the save, then check the server has it: the snapshot is now
    // under "Reviewed", labelled Dry. Undo there, leaving the data as it was.
    await expect(card.getByRole("button", { name: "Undo" })).toBeEnabled()
    await page.goto("/admin/label?show=done")
    const saved = page.locator("article", {
      has: page.locator(`img[src="${src}"]`),
    })
    await expect(saved.getByRole("button", { name: "Dry" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await saved.getByRole("button", { name: "Undo" }).click()
    await expect(saved.getByText("Not reviewed yet")).toBeVisible()
    await expect(saved.getByRole("button", { name: "Undo" })).toBeHidden()
  })
})
