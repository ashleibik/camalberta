import type { MetadataRoute } from "next"

/**
 * Lets people add CamAlberta to their Home Screen. On iPhone and iPad that's
 * also what makes Trip Check alerts possible (Safari only allows web push for
 * Home Screen apps).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CamAlberta",
    short_name: "CamAlberta",
    description:
      "Should you drive today? Road conditions and traffic cameras for Calgary, the Bow Valley, the QEII and Edmonton.",
    start_url: "/trip",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
