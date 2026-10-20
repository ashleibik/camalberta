import "server-only"

import { toJpeg } from "@/lib/images/resize"

/**
 * Small versions of camera photos for the Trip Check strip: 320px wide JPEG,
 * about 7 KB instead of 176 KB (Phase 9 measurement over the Bow Valley).
 *
 * Cached the same way as the photo itself: one resize per camera per photo.
 * The entry is keyed on the exact bytes object the image cache returned, so
 * while that photo is cached (until the camera's next one is due) every
 * request reuses one resize, and a new photo gets a new one.
 */
export const THUMBNAIL_WIDTH = 320
const THUMBNAIL_QUALITY = 75
const MAX_ENTRIES = 1000

interface Entry {
  source: Uint8Array
  promise: Promise<Uint8Array | null>
}

type ThumbGlobal = typeof globalThis & {
  __camalbertaThumbnails?: Map<string, Entry>
}

function cache(): Map<string, Entry> {
  const g = globalThis as ThumbGlobal
  g.__camalbertaThumbnails ??= new Map()
  return g.__camalbertaThumbnails
}

/**
 * The thumbnail for a camera's current photo, or null if it couldn't be
 * resized (the caller then serves the original).
 */
export function getThumbnail(
  cameraId: string,
  source: Uint8Array
): Promise<Uint8Array | null> {
  const store = cache()
  const existing = store.get(cameraId)
  if (existing && existing.source === source) return existing.promise

  const promise = toJpeg(source, THUMBNAIL_WIDTH, THUMBNAIL_QUALITY).then(
    (resized) => resized.data,
    (error: unknown) => {
      const name = error instanceof Error ? error.name : "Error"
      console.error(`[thumbnail] resize failed for ${cameraId}: ${name}`)
      return null
    }
  )
  store.set(cameraId, { source, promise })

  // One entry per camera is expected; drop the oldest if that ever grows.
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value
    if (oldest !== undefined) store.delete(oldest)
  }
  return promise
}
