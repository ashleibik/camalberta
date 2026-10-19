import { LayoutGrid } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { AppNav } from "@/components/app/app-nav"
import { StatusBar } from "@/components/app/status-bar"
import { TripCheck, TripCheckSkeleton } from "@/components/app/trip/trip-check"
import { Brand } from "@/components/shell/brand"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Trip Check",
  description:
    "Should I drive to the mountains today? Road conditions, closures and cameras from Calgary to Canmore, Banff, Lake Louise and Edmonton, from 511 Alberta.",
}

export default function TripPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b bg-sidebar/95 backdrop-blur supports-[backdrop-filter]:bg-sidebar/80">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4">
          <Link
            href="/trip"
            className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Brand />
          </Link>
          <div className="flex items-center gap-1">
            <AppNav active="trip" />
            <Button
              asChild
              variant="ghost"
              size="icon"
              aria-label="Camera wall"
              className="hidden sm:inline-flex"
            >
              <Link href="/wall">
                <LayoutGrid aria-hidden="true" />
              </Link>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 sm:py-8">
        {/* The trip comes from ?to=, which is only known in the browser for
            this static page, so that part streams in behind a skeleton. */}
        <Suspense fallback={<TripCheckSkeleton />}>
          <TripCheck />
        </Suspense>
      </main>

      <StatusBar />
    </div>
  )
}
