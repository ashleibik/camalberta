// Builds the app icon set and the default link-preview image from the SVG
// designs below (npm run build:icons). The outputs are committed; run this
// again only when the design changes.
//
// Icon: a camera lens (green ring, the app's #22c55e accent) with a road
// running to the horizon inside it, on the dark zinc of the ops console.
// Original artwork; no third-party logos.
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import sharp from "sharp"

const root = path.resolve(import.meta.dirname, "..")
const app = path.join(root, "src/app")
const pub = path.join(root, "public")

const ZINC_950 = "#09090b"
const ZINC_900 = "#18181b"
const ZINC_700 = "#3f3f46"
const ZINC_500 = "#71717a"
const ZINC_400 = "#a1a1aa"
const ZINC_50 = "#fafafa"
const GREEN = "#22c55e" // status-live: "Looks good"
const AMBER = "#f59e0b" // status-stale: "Drive carefully"
const RED = "#ef4444" // status-offline: "Check before you go"

/** The lens and road, drawn in a 64x64 box centred on (32, 32). */
function mark() {
  return `
    <defs><clipPath id="lens"><circle cx="32" cy="32" r="19"/></clipPath></defs>
    <circle cx="32" cy="32" r="19" fill="${ZINC_900}"/>
    <g clip-path="url(#lens)">
      <path d="M14 54 L29.5 30 H34.5 L50 54 Z" fill="${ZINC_700}"/>
      <path d="M31.2 52 L31.6 33 H32.4 L32.8 52 Z" fill="${GREEN}"/>
    </g>
    <circle cx="32" cy="32" r="21" fill="none" stroke="${GREEN}" stroke-width="4.5"/>
    <circle cx="44.5" cy="19.5" r="3.2" fill="${GREEN}"/>`
}

/** Square icon. `rounded`: a rounded tile (browser tabs); else full bleed. */
function iconSvg({ size = 64, rounded = true, scale = 1 } = {}) {
  const inset = (64 - 64 * scale) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
    <rect width="64" height="64" rx="${rounded ? 14 : 0}" fill="${ZINC_950}"/>
    <g transform="translate(${inset} ${inset}) scale(${scale})">${mark()}</g>
  </svg>`
}

function ogSvg() {
  const pill = (x, color, label, width) => `
    <g transform="translate(${x} 430)">
      <rect width="${width}" height="76" rx="38" fill="${color}" fill-opacity="0.14" stroke="${color}" stroke-width="3"/>
      <circle cx="38" cy="38" r="12" fill="${color}"/>
      <text x="62" y="49" font-size="31" font-weight="700" fill="${ZINC_50}">${label}</text>
    </g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <style>text { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; }</style>
    <rect width="1200" height="630" fill="${ZINC_950}"/>
    <rect x="0" y="0" width="1200" height="8" fill="${GREEN}"/>
    <g transform="translate(80 92) scale(3.6)">
      <rect width="64" height="64" rx="14" fill="${ZINC_900}"/>${mark()}
    </g>
    <text x="350" y="185" font-size="96" font-weight="800" fill="${ZINC_50}">CamAlberta</text>
    <text x="352" y="262" font-size="54" font-weight="600" fill="${ZINC_400}">Should I drive today?</text>
    <text x="82" y="380" font-size="34" fill="${ZINC_400}">Live cameras and road conditions · Calgary, the Rockies, Edmonton</text>
    ${pill(80, GREEN, "Looks good", 250)}
    ${pill(350, AMBER, "Drive carefully", 310)}
    ${pill(680, RED, "Check before you go", 400)}
    <text x="82" y="586" font-size="28" fill="${ZINC_500}">Official 511 Alberta data</text>
  </svg>`
}

const png = (svg, size) =>
  sharp(Buffer.from(svg))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer()

/** A .ico holding PNG images (supported by every current browser). */
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + 16 * images.length
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt16LE(1, 4) // colour planes
    e.writeUInt16LE(32, 6) // bits per pixel
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    return e
  })
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)])
}

await mkdir(pub, { recursive: true })

const favicon = ico(
  await Promise.all(
    [16, 32, 48].map(async (size) => ({
      size,
      data: await png(iconSvg(), size),
    }))
  )
)
const og = await sharp(Buffer.from(ogSvg()))
  .png({ compressionLevel: 9 })
  .toBuffer()
const ogAlt =
  "CamAlberta: Should I drive today? Green, yellow and red trip verdicts for Calgary, the Rockies and Edmonton."

const outputs = {
  [path.join(app, "favicon.ico")]: favicon,
  [path.join(app, "icon.svg")]: iconSvg(),
  // iOS rounds the corners itself and wants no transparency.
  [path.join(app, "apple-icon.png")]: await png(
    iconSvg({ rounded: false }),
    180
  ),
  [path.join(pub, "icon-192.png")]: await png(iconSvg(), 192),
  [path.join(pub, "icon-512.png")]: await png(iconSvg(), 512),
  // Maskable: full-bleed background, the mark inside the central safe zone.
  [path.join(pub, "icon-maskable-512.png")]: await png(
    iconSvg({ rounded: false, scale: 0.72 }),
    512
  ),
  [path.join(app, "opengraph-image.png")]: og,
  [path.join(app, "opengraph-image.alt.txt")]: ogAlt,
  [path.join(app, "twitter-image.png")]: og,
  [path.join(app, "twitter-image.alt.txt")]: ogAlt,
}
for (const [file, data] of Object.entries(outputs)) {
  await writeFile(file, data)
  const bytes = typeof data === "string" ? Buffer.byteLength(data) : data.length
  console.log(`${path.relative(root, file)}  ${(bytes / 1024).toFixed(1)} KB`)
}
