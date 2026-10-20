import "server-only"

import sharp from "sharp"

/**
 * Image resizing for camera photos (sharp / libvips). Inputs are upstream
 * camera images we already size-capped (3 MB) and type-checked (JPEG/PNG);
 * the pixel cap below also stops a small file that decodes to a huge image
 * (a "decompression bomb"). Real cameras send at most 1920x1080.
 */
const MAX_INPUT_PIXELS = 25_000_000

export interface Resized {
  data: Uint8Array
  width: number
  height: number
}

/** A JPEG at most `width` wide (never enlarged), aspect ratio kept. */
export async function toJpeg(
  input: Uint8Array,
  width: number,
  quality: number
): Promise<Resized> {
  const { data, info } = await sharp(input, {
    limitInputPixels: MAX_INPUT_PIXELS,
    failOn: "error",
  })
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })
  return { data: new Uint8Array(data), width: info.width, height: info.height }
}

/** Mean brightness of an image, 0 (black) to 255 (white). */
export async function meanBrightness(input: Uint8Array): Promise<number> {
  const { channels } = await sharp(input, {
    limitInputPixels: MAX_INPUT_PIXELS,
  })
    .greyscale()
    .stats()
  return channels[0]?.mean ?? 0
}
