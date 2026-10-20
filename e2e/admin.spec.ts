import { randomBytes } from "node:crypto"

import { expect, test } from "@playwright/test"

// The label page and everything under /admin need the admin login (HTTP
// Basic, ADMIN_USERNAME + ADMIN_PASSWORD; not CRON_SECRET), lock an address
// out after 5 wrong passwords, and are never indexed. In development the
// admin pages are on whenever a login is configured; production also needs
// ADMIN_ENABLED=true (unit tested; checked by hand on a production build).

const USER = process.env.ADMIN_USERNAME
const PASSWORD = process.env.ADMIN_PASSWORD

const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`

// A made-up address per test (the dev server trusts X-Real-IP, as it would
// from Vercel's proxy), so lockouts never touch the real session.
const fakeIp = () =>
  `2001:db8:${randomBytes(2).toString("hex")}:${randomBytes(2).toString("hex")}::1`

test("robots.txt keeps crawlers out of /admin and the API", async ({
  request,
  isMobile,
}) => {
  test.skip(isMobile, "API checks run once")
  const response = await request.get("/robots.txt")
  expect(response.status()).toBe(200)
  const body = await response.text()
  expect(body).toContain("Disallow: /admin")
  expect(body).toContain("Disallow: /api/")
})

test("admin pages and collection require a login", async ({
  request,
  isMobile,
}) => {
  test.skip(isMobile, "API checks run once")
  test.skip(!USER || !PASSWORD, "needs ADMIN_USERNAME and ADMIN_PASSWORD")
  for (const path of ["/admin", "/admin/label", "/admin/snapshots/1/image"]) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(401)
    const h = response.headers()
    expect(h["www-authenticate"], path).toMatch(
      /^Basic realm="CamAlberta admin"/
    )
    expect(h["cache-control"], path).toBe("no-store")
    expect(h["x-robots-tag"], path).toBe("noindex, nofollow")
  }
  expect((await request.post("/api/collect")).status()).toBe(401)

  // CRON_SECRET is not an admin login, in any form.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const ip = fakeIp()
    for (const authorization of [
      `Bearer ${secret}`,
      basic(USER!, secret),
      basic("admin", secret),
    ]) {
      const response = await request.get("/admin/label", {
        headers: { authorization, "x-real-ip": ip },
      })
      expect(response.status()).toBe(401)
    }
  }
})

test("five wrong passwords lock the address out for 15 minutes", async ({
  request,
  isMobile,
}) => {
  test.skip(isMobile, "API checks run once")
  test.skip(!USER || !PASSWORD, "needs ADMIN_USERNAME and ADMIN_PASSWORD")
  const ip = fakeIp()
  const get = (authorization: string, from = ip) =>
    request.get("/admin/label", {
      headers: { authorization, "x-real-ip": from },
    })

  for (let i = 1; i <= 4; i++) {
    expect((await get(basic(USER!, `wrong-password-${i}`))).status()).toBe(401)
  }
  const fifth = await get(basic(USER!, "wrong-password-5"))
  expect(fifth.status()).toBe(429)
  expect(fifth.headers()["retry-after"]).toBe("900")

  // Locked: even the right password is refused, from any address in the
  // same IPv6 /64.
  expect((await get(basic(USER!, PASSWORD!))).status()).toBe(429)
  expect(
    (await get(basic(USER!, PASSWORD!), ip.replace(/::1$/, "::2"))).status()
  ).toBe(429)
  // Everyone else can still sign in.
  expect((await get(basic(USER!, PASSWORD!), fakeIp())).status()).toBe(200)
})

test.describe("with a login configured", () => {
  test.skip(!USER || !PASSWORD, "needs ADMIN_USERNAME and ADMIN_PASSWORD")
  test.use({
    httpCredentials: { username: USER ?? "", password: PASSWORD ?? "" },
  })

  test("the snapshot image route validates its id", async ({
    request,
    isMobile,
  }) => {
    test.skip(isMobile, "API checks run once")
    const headers = { authorization: basic(USER!, PASSWORD!) }
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
    const response = await page.goto("/admin/label")
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow")
    await expect(
      page.getByRole("heading", { level: 1, name: "Label road conditions" })
    ).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/
    )
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
