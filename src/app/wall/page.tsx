import type { Metadata } from "next"
import { cookies } from "next/headers"
import { Suspense } from "react"

import { WallClient } from "@/components/app/wall/wall-client"
import { parseWallParams, WALL_COOKIE, wallFromCookie } from "@/lib/client/wall"
import { pageMetadata } from "@/lib/site"

export const metadata: Metadata = pageMetadata({
  title: "Camera wall",
  description:
    "Watch up to 16 live Alberta traffic cameras side by side, and share your wall as a link.",
  path: "/wall",
})

/**
 * The wall is rendered on the server from the URL (shareable links) or, for
 * a bare /wall, the wall cookie, so the first paint already shows the right
 * wall. Both are untrusted and go through the same strict parser.
 */
async function WallWithConfig({
  searchParams,
}: {
  searchParams: PageProps<"/wall">["searchParams"]
}) {
  const params = await searchParams
  const search = new URLSearchParams()
  for (const key of ["grid", "cams"] as const) {
    const value = params[key]
    if (typeof value === "string") search.set(key, value)
  }
  const fromUrl = parseWallParams(`?${search.toString()}`)
  const fromCookie = fromUrl
    ? null
    : wallFromCookie((await cookies()).get(WALL_COOKIE)?.value)
  return <WallClient initialWall={fromUrl ?? fromCookie} />
}

export default function WallPage({ searchParams }: PageProps<"/wall">) {
  return (
    <Suspense
      fallback={<div className="h-dvh bg-background" aria-busy="true" />}
    >
      <WallWithConfig searchParams={searchParams} />
    </Suspense>
  )
}
