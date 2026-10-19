import path from "node:path"

import type { NextConfig } from "next"

const isDev = process.env.NODE_ENV === "development"

// The only third-party origin the browser may talk to. Camera images and all
// upstream APIs go through our own backend, so they are covered by 'self'.
const MAP_TILE_HOST = "https://tiles.openfreemap.org"

// 'unsafe-inline' for scripts is required because Next.js injects inline
// bootstrap scripts and nonces are incompatible with cacheComponents (PPR).
// See CLAUDE.md > Security for the tradeoff. 'unsafe-eval' is dev-only (React
// uses eval for error overlays in development).
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${MAP_TILE_HOST}`,
  "font-src 'self'",
  `connect-src 'self' ${MAP_TILE_HOST}`,
  // Live video (hls.js) plays through Media Source Extensions, which hand the
  // <video> element a blob: URL. The stream itself comes from our own relay.
  "media-src 'self' blob:",
  // MapLibre GL and hls.js spawn their workers from blob: URLs.
  "worker-src 'self' blob:",
  "child-src blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Other sites can't embed our responses (e.g. <img>/<video> pointing at
  // the camera proxy), so nobody can hotlink our relay and spend our
  // bandwidth. Our own pages are same-origin and unaffected.
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
]

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // PGlite loads its WASM and data files from disk at runtime, so it must not
  // be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  turbopack: {
    // Pin the root so a stray lockfile in a parent folder is never picked up.
    root: path.join(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
  // Trip Check is the homepage; the camera map lives at /map. Query strings
  // pass through, so old shared links like /?cam=<id> open that camera on the
  // map. Temporary (307), so the homepage can change again later.
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "query", key: "cam" }],
        destination: "/map",
        permanent: false,
      },
      { source: "/", destination: "/trip", permanent: false },
    ]
  },
}

export default nextConfig
