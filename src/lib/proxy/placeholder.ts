// A small, self-contained SVG served when an upstream image is unavailable.
// No external data goes into it, so it is safe to serve as an image.
const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180" role="img" aria-label="Camera image unavailable">
  <rect width="320" height="180" fill="#18181b"/>
  <g fill="none" stroke="#52525b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="translate(142 66)">
    <path d="M2 6h22a2 2 0 0 1 2 2v6l8-4v16l-8-4v6a2 2 0 0 1-2 2H2"/>
    <line x1="0" y1="0" x2="36" y2="36" stroke="#3f3f46"/>
  </g>
  <text x="160" y="140" fill="#71717a" font-family="system-ui, sans-serif" font-size="13" text-anchor="middle">Camera unavailable</text>
</svg>`

export function placeholderResponse(): Response {
  return new Response(PLACEHOLDER_SVG, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Short cache so the real image returns quickly once the camera recovers.
      "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20",
    },
  })
}
