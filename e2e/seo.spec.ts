import { expect, test, type APIRequestContext } from "@playwright/test"

// Link previews (Meta, LinkedIn, X, iMessage, Discord): every public page
// carries complete Open Graph and Twitter tags with an absolute 1200x630
// image, as the platforms' crawlers see it. API checks: desktop project only.
test.skip(({ isMobile }) => isMobile, "API checks run once")

const PAGES = [
  "/trip",
  "/trip?to=canmore",
  "/trip?to=banff",
  "/trip?to=lake-louise",
  "/trip?to=edmonton",
  "/map",
  "/wall",
]

const CRAWLERS = {
  facebook:
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  linkedin:
    "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
  x: "Twitterbot/1.0",
  whatsapp: "WhatsApp/2.23.20.0 A",
  discord: "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")

/** All <meta> tags of a page, keyed by property or name (repeats listed). */
function metaTags(html: string): Map<string, string[]> {
  const tags = new Map<string, string[]>()
  for (const [tag] of html.matchAll(/<meta\s[^>]*>/g)) {
    const attrs = Object.fromEntries(
      [...tag.matchAll(/([a-z:-]+)="([^"]*)"/gi)].map((m) => [
        m[1]!.toLowerCase(),
        decode(m[2]!),
      ])
    )
    const key = attrs.property ?? attrs.name
    if (key && attrs.content !== undefined) {
      tags.set(key, [...(tags.get(key) ?? []), attrs.content])
    }
  }
  return tags
}

async function page(request: APIRequestContext, path: string, ua: string) {
  const response = await request.get(path, { headers: { "user-agent": ua } })
  expect(response.status(), path).toBe(200)
  return metaTags(await response.text())
}

/** PNG width and height from the IHDR chunk. */
const pngSize = (b: Buffer) => [b.readUInt32BE(16), b.readUInt32BE(20)]

test("every public page has complete link-preview tags", async ({
  request,
}) => {
  const titles = new Set<string>()
  for (const path of PAGES) {
    const meta = await page(request, path, CRAWLERS.facebook)
    const one = (key: string) => meta.get(key)?.[0] ?? ""

    expect(one("og:title"), path).not.toBe("")
    expect(one("og:description"), path).not.toBe("")
    expect(one("og:image"), path).toMatch(/^https?:\/\//)
    expect(one("og:image:width"), path).toBe("1200")
    expect(one("og:image:height"), path).toBe("630")
    expect(one("og:site_name"), path).toBe("CamAlberta")
    expect(one("og:locale"), path).toBe("en_CA")
    expect(one("og:type"), path).toBe("website")
    expect(one("twitter:card"), path).toBe("summary_large_image")
    expect(one("twitter:image"), path).toMatch(/^https?:\/\//)
    // Never the live verdict: platforms cache previews for days.
    for (const key of ["og:title", "og:description", "twitter:title"]) {
      expect(one(key), `${path} ${key}`).not.toMatch(
        /Looks good|Drive carefully|Check before you go|Can.t confirm/
      )
    }
    titles.add(one("og:title"))
  }
  expect(titles.size, "each page has its own preview title").toBe(PAGES.length)
})

test("the share image is a 1200x630 PNG under 300 KB", async ({ request }) => {
  const meta = await page(request, "/trip", CRAWLERS.facebook)
  for (const key of ["og:image", "twitter:image"]) {
    const url = new URL(meta.get(key)![0]!)
    const response = await request.get(url.pathname + url.search)
    expect(response.status(), key).toBe(200)
    expect(response.headers()["content-type"], key).toBe("image/png")
    const body = await response.body()
    expect(pngSize(body), key).toEqual([1200, 630])
    expect(body.length, key).toBeLessThan(300 * 1024)
  }
})

test("preview crawlers get the page tags and the image", async ({
  request,
}) => {
  for (const [name, ua] of Object.entries(CRAWLERS)) {
    const meta = await page(request, "/trip?to=banff", ua)
    const image = new URL(meta.get("og:image")![0]!)
    const response = await request.get(image.pathname + image.search, {
      headers: { "user-agent": ua },
    })
    expect(response.status(), name).toBe(200)
    expect(response.headers()["cross-origin-resource-policy"], name).toBe(
      "cross-origin"
    )
  }
})

test("icons, manifest and theme colours", async ({ request }) => {
  const meta = await page(request, "/trip", CRAWLERS.facebook)
  expect(meta.get("theme-color")?.length).toBe(2)

  for (const [path, type] of [
    ["/favicon.ico", "image/x-icon"],
    ["/icon.svg", "image/svg+xml"],
    ["/apple-icon.png", "image/png"],
  ] as const) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(200)
    expect(response.headers()["content-type"], path).toContain(type)
  }
  expect(pngSize(await (await request.get("/apple-icon.png")).body())).toEqual([
    180, 180,
  ])

  const manifest = await (await request.get("/manifest.webmanifest")).json()
  expect(manifest.name).toBe("CamAlberta")
  expect(manifest.short_name).toBe("CamAlberta")
  for (const icon of manifest.icons as Array<{ src: string; sizes: string }>) {
    const body = await (await request.get(icon.src)).body()
    const [w, h] = pngSize(body)
    expect(`${w}x${h}`, icon.src).toBe(icon.sizes)
  }
  expect(
    (manifest.icons as Array<{ purpose?: string }>).some(
      (i) => i.purpose === "maskable"
    )
  ).toBe(true)
})

test("robots.txt and sitemap.xml list public pages, never /admin", async ({
  request,
}) => {
  const robots = await (await request.get("/robots.txt")).text()
  expect(robots).toContain("Disallow: /admin")
  expect(robots).toMatch(/Sitemap: https?:\/\/\S+\/sitemap\.xml/)
  // No crawler-specific rules: preview bots fall under "*".
  expect(robots).not.toMatch(
    /User-Agent: (facebookexternalhit|LinkedInBot|Twitterbot|WhatsApp|Discordbot)/i
  )

  const sitemap = await (await request.get("/sitemap.xml")).text()
  for (const path of PAGES) {
    expect(sitemap, path).toContain(`${path}</loc>`)
  }
  expect(sitemap).not.toContain("/admin")
})
