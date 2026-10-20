import { LayoutGrid } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { AppNav } from "@/components/app/app-nav"
import { IntentLink } from "@/components/app/intent-link"
import { SkipLink } from "@/components/app/skip-link"
import { StatusBar } from "@/components/app/status-bar"
import { TripCheck, TripCheckSkeleton } from "@/components/app/trip/trip-check"
import { Brand } from "@/components/shell/brand"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { isPushConfigured, vapidPublicKey } from "@/lib/push/config"
import { getCachedTripReport } from "@/lib/trip/store"
import { parseTripParam } from "@/lib/trip/trips"

export const metadata: Metadata = {
  title: "Trip Check",
  description:
    "Should I drive to the mountains today? Road conditions, closures and cameras from Calgary to Canmore, Banff, Lake Louise and Edmonton, from 511 Alberta.",
}

/**
 * The verdict is rendered on the server and streamed into the first
 * response, so it shows before any JavaScript runs (it's the page's largest
 * paint). Only this part waits on `?to=` and the database; the rest of the
 * page is a prerendered static shell.
 */
async function TripCheckWithData({
  searchParams,
}: {
  searchParams: PageProps<"/trip">["searchParams"]
}) {
  const { to } = await searchParams
  const trip = parseTripParam(typeof to === "string" ? to : null)
  // If the database is unavailable, the client shows its own error and retry.
  const report = await getCachedTripReport(trip).catch(() => null)
  return (
    <TripCheck
      initialTrip={trip}
      initialReport={report}
      alertKey={vapidPublicKey()}
    />
  )
}

export default function TripPage({ searchParams }: PageProps<"/trip">) {
  return (
    <div className="flex flex-col">
      <SkipLink />
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
              <IntentLink href="/wall">
                <LayoutGrid aria-hidden="true" />
              </IntentLink>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* At least a full screen tall, so the footer starts below the fold and
          never jumps as the content loads. */}
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto min-h-dvh w-full max-w-5xl px-4 py-5 outline-none sm:py-8"
      >
        <div className="mb-5 space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">
            Should I drive today?
          </h1>
          <p className="text-sm text-muted-foreground">
            Road conditions, closures and cameras from Calgary, using 511
            Alberta.
          </p>
        </div>
        <Suspense fallback={<TripCheckSkeleton alerts={isPushConfigured()} />}>
          <TripCheckWithData searchParams={searchParams} />
        </Suspense>
      </main>

      <StatusBar />
    </div>
  )
}
