"use client"

import { Loader2, Map as MapIcon } from "lucide-react"
import dynamic from "next/dynamic"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import type { TripReport } from "@/lib/api-types"

import { RoutePreview } from "./route-preview"

// MapLibre is about 1 MB of JavaScript and blocked a phone's main thread for
// ~4.7 s (Lighthouse, Phase 8), so it loads only when someone asks for it.
const TripMapView = dynamic(() => import("./trip-map-view"), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      Loading map…
    </div>
  ),
})

function Legend() {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <span
          className="h-1 w-4 rounded-full bg-status-live"
          aria-hidden="true"
        />
        Road OK
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className="h-1 w-4 rounded-full bg-status-stale"
          aria-hidden="true"
        />
        Drive carefully
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className="h-1 w-4 rounded-full bg-status-offline"
          aria-hidden="true"
        />
        Closed or not recommended
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className="flex size-3.5 items-center justify-center rounded-full bg-status-stale text-[9px] font-bold text-black"
          aria-hidden="true"
        >
          !
        </span>
        Event
      </li>
      <li className="flex items-center gap-1.5">
        <span
          className="size-2.5 rounded-full border-2 border-foreground bg-background"
          aria-hidden="true"
        />
        Camera
      </li>
    </ul>
  )
}

export function TripMap({ report }: { report: TripReport }) {
  const [interactive, setInteractive] = useState(false)

  return (
    <section aria-labelledby="trip-map-heading">
      <h2 id="trip-map-heading" className="mb-2 text-sm font-semibold">
        Route map
      </h2>
      <div className="relative h-64 overflow-hidden rounded-xl border bg-muted/40 sm:h-80">
        {interactive ? (
          <TripMapView report={report} />
        ) : (
          <>
            <RoutePreview report={report} className="p-3" />
            <Button
              variant="secondary"
              size="sm"
              className="absolute right-3 bottom-3 shadow-sm"
              onClick={() => setInteractive(true)}
            >
              <MapIcon aria-hidden="true" />
              Explore map
            </Button>
          </>
        )}
      </div>
      <Legend />
    </section>
  )
}
