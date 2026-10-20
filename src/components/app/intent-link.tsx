"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import type { ComponentProps } from "react"

/**
 * A Link that prefetches on intent (pointer over, touch, keyboard focus)
 * instead of as soon as it's visible. Header links are always visible, and
 * prefetching /map from Trip Check pulled ~58 KB of the map's code into every
 * homepage load (Lighthouse, Phase 8). Navigation stays fast: the prefetch
 * starts a moment before the click.
 */
export function IntentLink({
  href,
  onPointerEnter,
  onTouchStart,
  onFocus,
  ...props
}: Omit<ComponentProps<typeof Link>, "prefetch" | "href"> & { href: string }) {
  const router = useRouter()
  const prefetch = () => router.prefetch(href)
  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onPointerEnter={(e) => {
        prefetch()
        onPointerEnter?.(e)
      }}
      onTouchStart={(e) => {
        prefetch()
        onTouchStart?.(e)
      }}
      onFocus={(e) => {
        prefetch()
        onFocus?.(e)
      }}
    />
  )
}
