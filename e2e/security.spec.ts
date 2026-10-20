import { expect, test } from "@playwright/test"

// Phase 7 follow-up: header and input-validation regressions fail CI. These
// use the API directly (no browser), so they run once, in the desktop project.
test.skip(({ isMobile }) => isMobile, "API checks run once")

const PAGES = ["/trip", "/map", "/wall"]

test("every page sends the security headers", async ({ request }) => {
  for (const path of PAGES) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(200)
    const h = response.headers()
    const csp = h["content-security-policy"] ?? ""
    expect(csp, path).toContain("default-src 'self'")
    expect(csp, path).toContain("frame-ancestors 'none'")
    expect(csp, path).toContain("object-src 'none'")
    expect(h["strict-transport-security"], path).toContain("max-age=")
    expect(h["x-frame-options"], path).toBe("DENY")
    expect(h["x-content-type-options"], path).toBe("nosniff")
    expect(h["referrer-policy"], path).toBe("strict-origin-when-cross-origin")
    expect(h["permissions-policy"], path).toContain("camera=()")
    expect(h["permissions-policy"], path).toContain("microphone=()")
    expect(h["permissions-policy"], path).toContain("geolocation=()")
    expect(h["cross-origin-opener-policy"], path).toBe("same-origin")
    expect(h["cross-origin-resource-policy"], path).toBe("same-origin")
    expect(h["x-powered-by"], path).toBeUndefined()
  }
})

test("API routes reject bad input with a 4xx and no internals", async ({
  request,
}) => {
  const cases: Array<[string, number]> = [
    ["/api/cameras?url=https://evil.example", 400],
    ["/api/cameras/not-an-id", 400],
    ["/api/cameras/calgary:does-not-exist", 404],
    ["/api/cam/http%3A%2F%2F169.254.169.254/image", 400],
    ["/api/trips/jasper", 400],
    ["/api/trips/banff?debug=1", 400],
    ["/api/health?x=1", 400],
  ]
  for (const [path, status] of cases) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(status)
    const body = await response.text()
    expect(body, path).not.toMatch(/at \w+ \(|node_modules|\.ts:\d+/)
  }
})

test("protected routes fail closed without the secret", async ({ request }) => {
  expect((await request.post("/api/sync")).status()).toBe(401)
  expect((await request.post("/api/push/test")).status()).toBe(401)
})

test("push subscribe refuses cross-site, non-JSON and foreign endpoints", async ({
  request,
}) => {
  const P256DH = Buffer.concat([
    Buffer.from([4]),
    Buffer.alloc(64, 7),
  ]).toString("base64url")
  const AUTH = Buffer.alloc(16, 9).toString("base64url")
  const body = (endpoint: string) => ({
    trip: "banff",
    subscription: { endpoint, keys: { p256dh: P256DH, auth: AUTH } },
  })

  const crossSite = await request.post("/api/push/subscribe", {
    headers: { "sec-fetch-site": "cross-site" },
    data: body("https://fcm.googleapis.com/fcm/send/x"),
  })
  expect(crossSite.status()).toBe(403)

  const plain = await request.post("/api/push/subscribe", {
    headers: { "content-type": "text/plain" },
    data: JSON.stringify(body("https://fcm.googleapis.com/fcm/send/x")),
  })
  expect(plain.status()).toBe(415)

  // Our server must never be pointed at an arbitrary host (SSRF).
  for (const endpoint of [
    "https://169.254.169.254/latest/meta-data",
    "http://fcm.googleapis.com/fcm/send/x",
    "https://fcm.googleapis.com.evil.example/x",
  ]) {
    const response = await request.post("/api/push/subscribe", {
      data: body(endpoint),
    })
    expect(response.status(), endpoint).toBe(400)
  }
})

test("the wall cookie is scoped, Secure, Lax and read by the server", async ({
  browser,
}) => {
  const cams = "calgary:loc1,banff:bear-street"
  const first = await browser.newContext()
  const page = await first.newPage()
  await page.goto(`/wall?grid=3&cams=${cams}`)
  await expect
    .poll(async () =>
      (await first.cookies()).find((c) => c.name === "camalberta_wall")
    )
    .toMatchObject({
      path: "/wall",
      secure: true,
      sameSite: "Lax",
      httpOnly: false,
    })
  const cookie = (await first.cookies()).find(
    (c) => c.name === "camalberta_wall"
  )!
  await first.close()

  // A browser with only the cookie (no URL, no localStorage) gets that wall
  // from the server.
  const second = await browser.newContext()
  await second.addCookies([cookie])
  const response = await second.request.get("/wall")
  expect(await response.text()).toContain("banff:bear-street")
  await second.close()

  // A cookie over the size limit is ignored, not an error.
  const third = await browser.newContext()
  await third.addCookies([
    { ...cookie, value: `grid%3D3%26cams%3D${"a".repeat(3000)}` },
  ])
  const oversized = await third.request.get("/wall")
  expect(oversized.status()).toBe(200)
  expect(await oversized.text()).not.toContain("aaaaaaaaaa")
  await third.close()
})
