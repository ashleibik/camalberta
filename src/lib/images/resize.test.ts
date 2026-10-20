import sharp from "sharp"
import { describe, expect, it } from "vitest"

import { meanBrightness, toJpeg } from "./resize"

async function image(
  width: number,
  height: number,
  background: string,
  format: "jpeg" | "png" = "jpeg"
): Promise<Uint8Array> {
  const data = await sharp({
    create: { width, height, channels: 3, background },
  })
    [format]()
    .toBuffer()
  return new Uint8Array(data)
}

describe("toJpeg", () => {
  it("resizes to the width, keeping the aspect ratio", async () => {
    const out = await toJpeg(await image(1920, 1080, "#888"), 512, 80)
    expect([out.width, out.height]).toEqual([512, 288])
    const meta = await sharp(out.data).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 512, 288])
  })

  it("converts PNG and never enlarges", async () => {
    const out = await toJpeg(await image(400, 300, "#888", "png"), 512, 80)
    expect([out.width, out.height]).toEqual([400, 300])
    expect((await sharp(out.data).metadata()).format).toBe("jpeg")
  })

  it("rejects bytes that aren't an image", async () => {
    await expect(
      toJpeg(new TextEncoder().encode("<html></html>"), 512, 80)
    ).rejects.toThrow()
  })

  it("rejects an image over the pixel cap (decompression bomb)", async () => {
    // 5100 x 5000 = 25.5 million pixels: a small PNG, a huge decode.
    const bomb = await image(5100, 5000, "#000", "png")
    expect(bomb.byteLength).toBeLessThan(200_000)
    await expect(toJpeg(bomb, 512, 80)).rejects.toThrow(/pixel limit/i)
  }, 20_000)
})

describe("meanBrightness", () => {
  it("is 0 for black and 255 for white", async () => {
    expect(await meanBrightness(await image(64, 64, "#000", "png"))).toBe(0)
    expect(await meanBrightness(await image(64, 64, "#fff", "png"))).toBe(255)
  })
})
