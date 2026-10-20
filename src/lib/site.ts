import "server-only"

import type { Metadata } from "next"

import { env } from "@/lib/env"

/**
 * Site identity and link-preview metadata (Open Graph, X/Twitter). Previews
 * are cached by Meta, LinkedIn, X, iMessage and Discord for days, so they
 * never include live data such as today's verdict.
 */
export const SITE_NAME = "CamAlberta"
export const SITE_TITLE = "CamAlberta: Should I drive today?"
export const SITE_DESCRIPTION =
  "Live traffic cameras and road conditions for Calgary, the Rockies, and Edmonton. Pick a trip and get a green, yellow, or red verdict in 5 seconds."

/**
 * The public origin, for absolute preview URLs: NEXT_PUBLIC_SITE_URL, else
 * Vercel's production domain, else the local dev server.
 */
export function siteUrl(): URL {
  if (env.NEXT_PUBLIC_SITE_URL) return new URL(env.NEXT_PUBLIC_SITE_URL)
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  return new URL(vercel ? `https://${vercel}` : "http://localhost:3000")
}

const SHARE_IMAGE_ALT =
  "CamAlberta: Should I drive today? Green, yellow and red trip verdicts for Calgary, the Rockies and Edmonton."

/**
 * The share images (src/app/opengraph-image.png and twitter-image.png, made
 * by scripts/build-icons.mjs). Listed explicitly: a page that sets
 * `openGraph` loses the layout's file-based image.
 */
const shareImage = (url: string) => ({
  url,
  width: 1200,
  height: 630,
  type: "image/png",
  alt: SHARE_IMAGE_ALT,
})

const SHARED_OPEN_GRAPH = {
  siteName: SITE_NAME,
  locale: "en_CA",
  type: "website" as const,
  images: [shareImage("/opengraph-image.png")],
}

/**
 * A page's metadata with complete Open Graph and Twitter blocks. A page that
 * sets `openGraph` replaces the layout's whole block, so every page goes
 * through here. The share image comes from app/opengraph-image.png.
 */
export function pageMetadata({
  title,
  socialTitle,
  description,
  path,
}: {
  /** The browser tab title (the layout adds " · CamAlberta"). */
  title: string
  /** The preview title; defaults to "<title> · CamAlberta". */
  socialTitle?: string
  description: string
  /** This page's path, for og:url and the canonical link. */
  path: string
}): Metadata {
  const shareTitle = socialTitle ?? `${title} · ${SITE_NAME}`
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      ...SHARED_OPEN_GRAPH,
      title: shareTitle,
      description,
      url: path,
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description,
      images: [shareImage("/twitter-image.png")],
    },
  }
}

/** The layout's defaults, for any page without its own. */
export function rootMetadata(): Metadata {
  return {
    metadataBase: siteUrl(),
    ...pageMetadata({
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      socialTitle: SITE_TITLE,
      path: "/",
    }),
    title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
    applicationName: SITE_NAME,
  }
}
