"use client"

import { Star, Video, X } from "lucide-react"
import { useMemo } from "react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cameraImageUrl } from "@/lib/client/api"
import { toggleFavorite, useFavorites } from "@/lib/client/favorites"
import { useCamera } from "@/lib/client/queries"
import { useNow } from "@/lib/client/use-now"
import {
  areaLabel,
  formatCoord,
  sourceLabel,
  STATUS_LABELS,
  timeAgo,
} from "@/lib/format"
import { cn } from "@/lib/utils"

import { useAppState } from "./app-state"
import { StatusDot } from "./status-dot"
import { useVisibleCameras } from "./use-visible-cameras"

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xs">{value}</dd>
    </div>
  )
}

export function DetailContent({ onClose }: { onClose?: () => void }) {
  const { selectedId, setSelectedId } = useAppState()
  const { all } = useVisibleCameras()
  const favorites = useFavorites()
  const detail = useCamera(selectedId)
  const now = useNow()

  const listCamera = useMemo(
    () => all.find((c) => c.id === selectedId),
    [all, selectedId]
  )

  if (!selectedId || (!listCamera && !detail.data)) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed bg-muted/40">
          <Video className="size-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Select a camera to see its live snapshot.
        </p>
      </div>
    )
  }

  const camera = detail.data
  const name = listCamera?.name ?? camera?.name ?? "Camera"
  const status = listCamera?.status ?? camera?.status ?? "offline"
  const source = listCamera?.source ?? camera?.source ?? "calgary"
  const road = listCamera?.road ?? camera?.road ?? null
  const direction = listCamera?.direction ?? camera?.direction ?? null
  const quadrant = listCamera?.quadrant ?? camera?.quadrant ?? null
  const area = listCamera?.area ?? camera?.area ?? ""
  const lat = camera?.lat ?? listCamera?.lat
  const lng = camera?.lng ?? listCamera?.lng
  const isFavorite = favorites.has(selectedId)

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex items-start justify-between gap-2 p-4 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusDot status={status} />
            <span className="text-xs text-muted-foreground">
              {STATUS_LABELS[status]} · {sourceLabel(source)}
            </span>
          </div>
          <h2 className="mt-1 text-sm font-semibold break-words">{name}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
            aria-pressed={isFavorite}
            onClick={() => toggleFavorite(selectedId)}
          >
            <Star
              className={cn(
                "size-4",
                isFavorite && "fill-amber-400 text-amber-400"
              )}
              aria-hidden="true"
            />
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              onClick={() => {
                onClose()
                setSelectedId(null)
              }}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      <div className="px-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- proxied, dynamic per-camera URL */}
        <img
          key={selectedId}
          src={cameraImageUrl(selectedId)}
          alt={`Snapshot of ${name}`}
          className="aspect-video w-full rounded-lg border bg-muted object-cover"
          loading="lazy"
        />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4">
        {road && <Field label="Road" value={road} />}
        {direction && <Field label="Direction" value={direction} />}
        {quadrant && <Field label="Quadrant" value={quadrant} />}
        {area && <Field label="Area" value={areaLabel(area)} />}
        {lat !== undefined && lng !== undefined && (
          <>
            <Field label="Latitude" value={formatCoord(lat, "lat")} />
            <Field label="Longitude" value={formatCoord(lng, "lng")} />
          </>
        )}
      </dl>

      <Separator />
      <p className="p-4 pt-3 text-xs text-muted-foreground">
        Last synced{" "}
        {now === null ? "…" : timeAgo(detail.data?.lastSeenAt ?? null, now)}.
      </p>
    </div>
  )
}
