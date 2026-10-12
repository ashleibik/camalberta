import "server-only"

import { ZodError } from "zod"

import { readBodyLimited } from "@/lib/proxy/upstream"

// Camera list feeds are small (Calgary ~150 KB, Edmonton ~25 KB); anything
// near this cap is wrong, and must not be able to exhaust memory.
const MAX_FEED_BYTES = 5 * 1024 * 1024
const FEED_TIMEOUT_MS = 15_000

/** A sync failure whose message we wrote ourselves, so it's safe to return. */
export class SyncSourceError extends Error {
  override name = "SyncSourceError"
}

/**
 * A short reason for a failed source that is safe to return to the caller:
 * our own messages pass through, anything else (network errors, validation
 * details, upstream text) becomes a generic category. The full error goes to
 * the server log only.
 */
export function describeSyncError(error: unknown): string {
  if (error instanceof SyncSourceError) return error.message
  if (error instanceof ZodError) return "upstream data failed validation"
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "upstream timed out"
  }
  return "upstream request failed"
}

/**
 * Fetch and parse a source's JSON feed. Feeds are fixed, known endpoints, so
 * redirects are refused (a moved feed should fail loudly, not be followed),
 * and the body is size-capped while it streams in. `label` names the source
 * in error messages; the URL never appears in them.
 */
export async function fetchFeedJson(
  label: string,
  url: string | URL,
  init: RequestInit = {}
): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
  })
  if (!response.ok) {
    void response.body?.cancel().catch(() => {})
    throw new SyncSourceError(`${label} responded ${response.status}`)
  }
  const bytes = await readBodyLimited(response, MAX_FEED_BYTES)
  if (!bytes) throw new SyncSourceError(`${label} response was too large`)
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new SyncSourceError(`${label} response was not JSON`)
  }
}
