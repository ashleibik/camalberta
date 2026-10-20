"use client"

import { RotateCw } from "lucide-react"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { useCallback, useState } from "react"

import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { TripReport } from "@/lib/api-types"
import { useTripReport } from "@/lib/client/queries"
import {
  isTripId,
  parseTripParam,
  TRIP_IDS,
  TRIP_LABELS,
  type TripId,
} from "@/lib/trip/trips"

import { AppStateProvider, useAppState } from "../app-state"
import { AlertButton, AlertButtonPlaceholder } from "./alert-button"
import { CameraStrip, CameraStripSkeleton } from "./camera-strip"
import { ConditionList, EventList } from "./road-report"
import { TripMap } from "./trip-map"
import { Disclaimer, VerdictCard, VerdictSkeleton } from "./verdict-card"

function TripPicker({
  value,
  onChange,
}: {
  value: TripId | null
  onChange?: (trip: TripId) => void
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      value={value ?? ""}
      disabled={!onChange}
      // Radix sends "" when the active item is pressed again; keep the trip.
      onValueChange={(next) => {
        if (isTripId(next)) onChange?.(next)
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

const CameraSheet = dynamic(() => import("./camera-sheet"), { ssr: false })

/** Start loading the detail panel when someone looks ready to open it. */
export function preloadCameraSheet() {
  void import("./camera-sheet")
}

/**
 * Mounts the detail panel the first time a camera is opened, then keeps it
 * mounted so it can animate closed.
 */
function LazyCameraSheet() {
  const { selectedId } = useAppState()
  const [wanted, setWanted] = useState(false)
  if (selectedId !== null && !wanted) setWanted(true)
  return wanted ? <CameraSheet /> : null
}

interface TripCheckProps {
  /** The trip the server rendered, and its report (null if that failed). */
  initialTrip: TripId
  initialReport: TripReport | null
  /** VAPID public key; null hides the alert button (alerts are off). */
  alertKey: string | null
}

function TripCheckBody({
  initialTrip,
  initialReport,
  alertKey,
}: TripCheckProps) {
  const params = useSearchParams()
  const trip = parseTripParam(params.get("to"))
  const report = useTripReport(
    trip,
    trip === initialTrip ? initialReport : null
  )
  const { setSelectedId } = useAppState()

  // A shallow URL update: no server round trip, the report comes from the
  // API (and stays cached per trip for switching back).
  const selectTrip = useCallback(
    (next: TripId) => {
      setSelectedId(null)
      window.history.replaceState(null, "", `?to=${next}`)
    },
    [setSelectedId]
  )

  return (
    <div className="space-y-5">
      <TripPicker value={trip} onChange={selectTrip} />

      <div className="space-y-3">
        {report.data ? (
          <VerdictCard report={report.data} />
        ) : report.isError ? (
          <div className="flex min-h-[15.5rem] flex-col items-start justify-center gap-3 rounded-xl border-2 border-dashed p-4">
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

      {alertKey && <AlertButton trip={trip} publicKey={alertKey} />}

      {report.data ? (
        <>
          <CameraStrip
            cameras={report.data.cameras}
            fetchedAt={report.dataUpdatedAt}
            onIntent={preloadCameraSheet}
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

export function TripCheck(props: TripCheckProps) {
  return (
    <AppStateProvider>
      <TripCheckBody {...props} />
      <LazyCameraSheet />
    </AppStateProvider>
  )
}

/**
 * The page's loading state, laid out exactly like TripCheck while its report
 * loads, so nothing moves when the real content arrives.
 */
export function TripCheckSkeleton({ alerts }: { alerts: boolean }) {
  return (
    <div className="space-y-5" aria-busy="true">
      <TripPicker value={null} />
      <div className="space-y-3">
        <VerdictSkeleton />
        <Disclaimer />
      </div>
      {alerts && <AlertButtonPlaceholder />}
      <CameraStripSkeleton />
    </div>
  )
}
