import type { MetadataRoute } from "next"

/**
 * Crawlers may index the public pages, but not the admin pages (which also
 * send noindex and are off unless enabled) or the API and camera proxies
 * (crawling those would only load the camera operators' servers).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/"],
    },
  }
}
