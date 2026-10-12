import type { CameraSource } from "@/lib/db/schema"

/** How a source publishes its cameras: still photos or live video (HLS). */
export type CameraMedia = "photo" | "video"

export const SOURCE_MEDIA: Record<CameraSource, CameraMedia> = {
  calgary: "photo",
  alberta511: "photo",
  banff: "photo",
  sunshine: "photo",
  edmonton: "video",
}

export function isVideoSource(source: CameraSource): boolean {
  return SOURCE_MEDIA[source] === "video"
}

/** The source part of one of our ids (`<source>:<sourceId>`), if known. */
export function sourceFromId(id: string): CameraSource | null {
  const prefix = id.slice(0, Math.max(0, id.indexOf(":")))
  return Object.hasOwn(SOURCE_MEDIA, prefix) ? (prefix as CameraSource) : null
}
