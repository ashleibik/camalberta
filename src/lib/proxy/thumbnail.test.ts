import sharp from "sharp"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getThumbnail, THUMBNAIL_WIDTH } from "./thumbnail"

async function photo(width: number, height: number): Promise<Uint8Array> {
  const data = await sharp({
    create: { width, height, channels: 3, background: "#6b7280" },
  })
    .jpeg()
    .toBuffer()
  return new Uint8Array(data)
}

beforeEach(() => {
  ;(globalThis as { __camalbertaThumbnails?: unknown }).__camalbertaThumbnails =
    undefined
})

describe("getThumbnail", () => {
  it("makes a 320px wide JPEG", async () => {
    const thumb = await getThumbnail("banff:a", await photo(1280, 720))
    expect(thumb).not.toBeNull()
    const meta = await sharp(thumb!).metadata()
    expect(meta.format).toBe("jpeg")
    expect(meta.width).toBe(THUMBNAIL_WIDTH)
    expect(meta.height).toBe(180)
  })

  it("never enlarges a small photo", async () => {
    const thumb = await getThumbnail("banff:a", await photo(200, 100))
    expect((await sharp(thumb!).metadata()).width).toBe(200)
  })

  it("resizes once per cached photo, again for a new one", async () => {
    const first = await photo(640, 360)
    const a = getThumbnail("banff:a", first)
    expect(getThumbnail("banff:a", first)).toBe(a)

    // A new photo (a different bytes object) gets a new resize.
    const b = getThumbnail("banff:a", await photo(640, 360))
    expect(b).not.toBe(a)
    // Other cameras have their own entry.
    expect(getThumbnail("banff:b", first)).not.toBe(a)
  })

  it("returns null when the photo can't be decoded", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await getThumbnail("banff:a", new Uint8Array(100))).toBeNull()
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("resize failed for banff:a")
    )
    error.mockRestore()
  })
})
