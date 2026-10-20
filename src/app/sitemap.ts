import type { MetadataRoute } from "next"

import { siteUrl } from "@/lib/site"
import { TRIP_IDS } from "@/lib/trip/trips"

/** The public pages. /admin and the API are not listed (robots.ts). */
export default function sitemap(): MetadataRoute.Sitemap {
  const url = (path: string) => new URL(path, siteUrl()).toString()
  return [
    { url: url("/trip"), changeFrequency: "hourly", priority: 1 },
    ...TRIP_IDS.map((id) => ({
      url: url(`/trip?to=${id}`),
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
    { url: url("/map"), changeFrequency: "daily", priority: 0.7 },
    { url: url("/wall"), changeFrequency: "monthly", priority: 0.3 },
  ]
}
