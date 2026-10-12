"use client"

import { LayoutGrid, Star, Video, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { toggleFavorite, useFavorites } from "@/lib/client/favorites"
import { useCamera } from "@/lib/client/queries"
import { useNow } from "@/lib/client/use-now"
import { addToWall, loadWall, MAX_TILES } from "@/lib/client/wall"
import {
  areaLabel,
  formatCoord,
  SOURCE_CREDITS,
  sourceLabel,
  STATUS_LABELS,
  timeAgo,
} from "@/lib/format"
import { isVideoSource } from "@/lib/media"
import { cn } from "@/lib/utils"

import { useAppState } from "./app-state"
import { CameraMedia } from "./camera-media"
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

export function DetailContent({
  onClose,
  mediaActive = true,
}: {
  onClose?: () => void
  /** False while this panel is hidden, so it doesn't stream in the background. */
  mediaActive?: boolean
}) {
  const { selectedId, setSelectedId } = useAppState()
  const { all } = useVisibleCameras()
  const favorites = useFavorites()
  const detail = useCamera(selectedId)
  const now = useNow()
  const router = useRouter()

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
  const credit = SOURCE_CREDITS[source]

  const handleAddToWall = () => {
    const current = loadWall()
    if (current.cams.includes(selectedId)) {
      toast.info("Already on the wall")
      return
    }
    if (current.cams.length >= MAX_TILES) {
      toast.error(`The wall is full (max ${MAX_TILES}).`)
      return
    }
    addToWall(selectedId)
    toast.success("Added to the wall", {
      action: { label: "Open wall", onClick: () => router.push("/wall") },
    })
  }

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
        <CameraMedia
          key={selectedId}
          id={selectedId}
          name={name}
          active={mediaActive}
          showTiming
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          {isVideoSource(source) ? "Video" : "Photos"} ©{" "}
          <a
            href={credit.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 hover:text-foreground hover:underline"
          >
            {credit.owner}
          </a>
          {credit.terms && (
            <>
              {" · "}
              <a
                href={credit.terms}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                Terms of use
              </a>
            </>
          )}
        </p>
      </div>

      <div className="px-4 pt-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleAddToWall}
        >
          <LayoutGrid aria-hidden="true" />
          Add to wall
        </Button>
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
