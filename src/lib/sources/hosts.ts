import type { CameraSource } from "@/lib/db/schema"

/**
 * The only host each source is allowed to serve images (or, for video
 * sources, HLS streams) from. Adapters reject any other host at ingest, and
 * the proxies re-check before fetching (defense in depth against SSRF if a
 * stored URL were ever tampered with).
 */
export const SOURCE_IMAGE_HOSTS: Record<CameraSource, string> = {
  calgary: "trafficcam.calgary.ca",
  alberta511: "511.alberta.ca",
  banff: "ftp.banff.ca",
  sunshine: "cameras.skibanff.com",
  // The City of Edmonton's streaming CDN (live HLS video).
  edmonton: "cityed1-winkcdn1.winkcdn.com",
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
