"use client"

import { RotateCw } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useTripReport } from "@/lib/client/queries"
import { useMediaQuery } from "@/lib/client/use-media-query"
import {
  parseTripParam,
  TRIP_IDS,
  TRIP_LABELS,
  tripIdSchema,
  type TripId,
} from "@/lib/trip/trips"

import { AppStateProvider, useAppState } from "../app-state"
import { DetailContent } from "../detail-content"
import { AlertButton } from "./alert-button"
import { CameraStrip, CameraStripSkeleton } from "./camera-strip"
import { ConditionList, EventList } from "./road-report"
import { TripMap } from "./trip-map"
import { Disclaimer, VerdictCard, VerdictSkeleton } from "./verdict-card"

function TripPicker({
  value,
  onChange,
}: {
  value: TripId
  onChange: (trip: TripId) => void
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      value={value}
      // Radix sends "" when the active item is pressed again; keep the trip.
      onValueChange={(next) => {
        const parsed = tripIdSchema.safeParse(next)
        if (parsed.success) onChange(parsed.data)
      }}
      aria-label="Choose a trip from Calgary"
      className="grid w-full grid-cols-4"
    >
      {TRIP_IDS.map((id) => (
        <ToggleGroupItem
          key={id}
          value={id}
          aria-label={TRIP_LABELS[id].name}
          className="h-10 w-full min-w-0 px-1 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground sm:text-sm"
        >
          {TRIP_LABELS[id].short}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** The existing camera detail panel, as a sheet over Trip Check. */
function CameraSheet() {
  const { selectedId, setSelectedId } = useAppState()
  const wide = useMediaQuery("(min-width: 768px)")
  return (
    <Sheet
      open={selectedId !== null}
      onOpenChange={(open) => {
        if (!open) setSelectedId(null)
      }}
    >
      <SheetContent
        side={wide ? "right" : "bottom"}
        className={wide ? "w-96 gap-0 p-0 sm:max-w-96" : "h-[85dvh] gap-0 p-0"}
      >
        <SheetHeader className="border-b text-left">
          <SheetTitle>Camera details</SheetTitle>
          <SheetDescription className="sr-only">
            Live view and details for the selected camera
          </SheetDescription>
        </SheetHeader>
        <DetailContent onClose={() => setSelectedId(null)} />
      </SheetContent>
    </Sheet>
  )
}

function TripCheckBody() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const trip = parseTripParam(params.get("to"))
  const report = useTripReport(trip)
  const { setSelectedId } = useAppState()

  const selectTrip = useCallback(
    (next: TripId) => {
      setSelectedId(null)
      router.replace(`${pathname}?to=${next}`, { scroll: false })
    },
    [pathname, router, setSelectedId]
  )

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">
          Should I drive today?
        </h1>
        <p className="text-sm text-muted-foreground">
          Road conditions, closures and cameras from Calgary, using 511 Alberta.
        </p>
      </div>

      <TripPicker value={trip} onChange={selectTrip} />

      <div className="space-y-3">
        {report.data ? (
          <VerdictCard report={report.data} />
        ) : report.isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-dashed p-4">
            <p className="text-sm">Couldn&apos;t load the trip check.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void report.refetch()}
            >
              <RotateCw aria-hidden="true" />
              Try again
            </Button>
          </div>
        ) : (
          <VerdictSkeleton />
        )}
        <Disclaimer />
      </div>

      <AlertButton trip={trip} />

      {report.data ? (
        <>
          <CameraStrip
            cameras={report.data.cameras}
            fetchedAt={report.dataUpdatedAt}
          />
          <div className="grid gap-5 lg:grid-cols-2">
            <TripMap report={report.data} />
            <ConditionList segments={report.data.segments} />
          </div>
          <EventList events={report.data.events} />
        </>
      ) : (
        <CameraStripSkeleton />
      )}
    </div>
  )
}

export function TripCheck() {
  return (
    <AppStateProvider>
      <TripCheckBody />
      <CameraSheet />
    </AppStateProvider>
  )
}

/** Shown while the URL is read (the static shell of the page). */
export function TripCheckSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <VerdictSkeleton />
      <CameraStripSkeleton />
    </div>
  )
}
