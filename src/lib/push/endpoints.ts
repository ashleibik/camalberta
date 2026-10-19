/**
 * Which push services we will deliver to. A push subscription's endpoint is a
 * URL the browser gives us, and our server POSTs to it, so accepting any URL
 * would let anyone point our server at an arbitrary host (SSRF). Only the
 * browsers' own push services are allowed:
 *
 * - Chrome, Edge (Chromium) and Android: Firebase Cloud Messaging
 * - Firefox: Mozilla autopush
 * - Safari (macOS and iOS 16.4+): Apple Push Notification service
 * - Edge on Windows (legacy WNS endpoints)
 */
const EXACT_HOSTS = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
])

const HOST_SUFFIXES = [".notify.windows.com", ".push.apple.com"]

export const MAX_ENDPOINT_LENGTH = 1024

export function isAllowedPushEndpoint(value: string): boolean {
  if (value.length > MAX_ENDPOINT_LENGTH) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== "https:") return false
  // No credentials or explicit ports: the real services use neither.
  if (url.username || url.password || url.port) return false
  const host = url.hostname.toLowerCase()
  return (
    EXACT_HOSTS.has(host) ||
    HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  )
}
