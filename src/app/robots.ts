import type { MetadataRoute } from "next"

import { siteUrl } from "@/lib/site"

/**
 * Crawlers may index the public pages, but not the admin pages (which also
 * send noindex and are off unless enabled) or the API and camera proxies
 * (crawling those would only load the camera operators' servers). Link
 * preview bots (facebookexternalhit, LinkedInBot, Twitterbot, WhatsApp,
 * Discordbot) fall under "*", so pages and the share image are allowed.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/"],
    },
    sitemap: new URL("/sitemap.xml", siteUrl()).toString(),
  }
}
