import type { CameraSource } from "@/lib/db/schema"

/**
 * The only image host each source is allowed to serve from. Adapters reject
 * any other host at ingest, and the image proxy re-checks before fetching
 * (defense in depth against SSRF if a stored URL were ever tampered with).
 */
export const SOURCE_IMAGE_HOSTS: Record<CameraSource, string> = {
  calgary: "trafficcam.calgary.ca",
  alberta511: "511.alberta.ca",
}

/** True if `url` is an http(s) URL whose host matches the source's allowlist. */
export function isAllowedImageUrl(source: CameraSource, url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false
  return parsed.hostname.toLowerCase() === SOURCE_IMAGE_HOSTS[source]
}
