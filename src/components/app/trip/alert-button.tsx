"use client"

import { Bell, BellOff, BellRing, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  AlertError,
  disableAlerts,
  enableAlerts,
  needsHomeScreen,
  pushSupported,
  useAlertTrips,
} from "@/lib/client/push"
import { TRIP_LABELS, type TripId } from "@/lib/trip/trips"

type Support = "checking" | "yes" | "home-screen" | "no"

function message(error: unknown): string {
  return error instanceof AlertError
    ? error.message
    : "Something went wrong. Try again."
}

/**
 * "Notify me if this trip gets worse": browser push, no account. The server
 * passes its VAPID public key in (null when alerts are off, and then nothing
 * renders). Every state fills the same 40px row, so nothing below it moves.
 */
export function AlertButton({
  trip,
  publicKey,
}: {
  trip: TripId
  publicKey: string
}) {
  const on = useAlertTrips().has(trip)
  const [busy, setBusy] = useState(false)
  const [support, setSupport] = useState<Support>("checking")

  // Browser capabilities are only known after mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser-only APIs
    setSupport(
      pushSupported() ? "yes" : needsHomeScreen() ? "home-screen" : "no"
    )
  }, [])

  const name = TRIP_LABELS[trip].name

  if (support === "home-screen" || support === "no") {
    return (
      <p className="flex min-h-10 items-center gap-2 text-xs text-muted-foreground">
        <BellOff className="size-3.5 shrink-0" aria-hidden="true" />
        {support === "home-screen"
          ? "To get alerts on iPhone or iPad, add this site to your Home Screen (Share, then Add to Home Screen) and open it from there."
          : "This browser can't show alerts."}
      </p>
    )
  }

  const turnOn = async () => {
    setBusy(true)
    try {
      await enableAlerts(trip, publicKey)
      toast.success(`Alerts on for ${name}`, {
        description:
          "We'll notify you if it gets worse. No more than once an hour.",
      })
    } catch (error) {
      toast.error(message(error))
    } finally {
      setBusy(false)
    }
  }

  const turnOff = async () => {
    setBusy(true)
    try {
      await disableAlerts(trip)
      toast.success(`Alerts off for ${name}`)
    } catch (error) {
      toast.error(message(error))
    } finally {
      setBusy(false)
    }
  }

  if (on) {
    return (
      <div className="flex h-10 items-center justify-between gap-2 rounded-lg border bg-card px-3">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <BellRing
            className="size-4 shrink-0 text-status-live"
            aria-hidden="true"
          />
          <span className="truncate">Alerts on for {name}</span>
        </p>
        <Button variant="outline" size="sm" onClick={turnOff} disabled={busy}>
          {busy ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <BellOff aria-hidden="true" />
          )}
          Turn off
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-10 items-center">
      <Button
        variant="outline"
        size="lg"
        className="w-full sm:w-auto"
        onClick={turnOn}
        disabled={busy || support === "checking"}
      >
        {busy ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Bell aria-hidden="true" />
        )}
        Notify me if this trip gets worse
      </Button>
    </div>
  )
}

/** Same footprint as the button, for the loading skeleton. */
export function AlertButtonPlaceholder() {
  return <div className="h-10" aria-hidden="true" />
}
