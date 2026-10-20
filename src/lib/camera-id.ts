/**
 * Our own camera id: `<source>:<sourceId>`. Never a URL.
 *
 * Plain TypeScript so the browser bundle needs no validation library; the
 * server's Zod schema (camera-id-schema.ts) uses the same pattern.
 */
export const CAMERA_ID_PATTERN = /^[a-z0-9]+:[a-z0-9-]+$/
export const MAX_CAMERA_ID_LENGTH = 128

export function isCameraId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_CAMERA_ID_LENGTH &&
    CAMERA_ID_PATTERN.test(value)
  )
}
