"use client"

import { Check, Undo2 } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  ROAD_LABEL_NAMES,
  ROAD_LABELS,
  type RoadLabel,
} from "@/lib/collect/labels"
import { cn } from "@/lib/utils"

import { saveLabel } from "./actions"

export interface LabelCardData {
  id: number
  camera: string
  takenAt: string
  photoAge: string | null
  condition: string
  weather: string | null
  autoLabel: RoadLabel | null
  autoLabelReason: string
  humanLabel: RoadLabel | null
  reviewed: boolean
}

type Decision = RoadLabel | "none"

const KEYS: Record<string, Decision> = {
  "1": "dry",
  "2": "wet",
  "3": "partly_snow",
  "4": "snow_covered",
  "5": "cant_see",
  "0": "none",
}

export function LabelCard({ data }: { data: LabelCardData }) {
  const [state, setState] = useState({
    reviewed: data.reviewed,
    human: data.humanLabel,
  })
  const [pending, startTransition] = useTransition()

  const save = (decision: Decision | null) => {
    const previous = state
    setState(
      decision === null
        ? { reviewed: false, human: null }
        : { reviewed: true, human: decision === "none" ? null : decision }
    )
    startTransition(async () => {
      const result = await saveLabel({ id: data.id, label: decision })
      if (!result.ok) {
        setState(previous)
        toast.error(result.error)
      }
    })
  }

  // The label that counts for training: the human's, else the automatic one.
  const effective = state.reviewed ? state.human : data.autoLabel

  return (
    <article
      tabIndex={0}
      aria-label={`Snapshot from ${data.camera}, ${data.takenAt}`}
      onKeyDown={(e) => {
        if (
          e.target !== e.currentTarget &&
          !(e.target instanceof HTMLButtonElement)
        )
          return
        const decision = KEYS[e.key]
        if (decision) {
          e.preventDefault()
          save(decision)
        }
      }}
      className={cn(
        "overflow-hidden rounded-xl border bg-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        state.reviewed && "border-status-live/50"
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a private snapshot from our storage, served by an authenticated route */}
      <img
        src={`/admin/snapshots/${data.id}/image`}
        alt={`Snapshot from ${data.camera} at ${data.takenAt}`}
        loading="lazy"
        className="aspect-video w-full bg-muted object-cover"
      />
      <div className="space-y-2 p-3 text-xs">
        <div>
          <p className="truncate text-sm font-medium">{data.camera}</p>
          <p className="font-mono text-muted-foreground">
            {data.takenAt}
            {data.photoAge && ` · photo ${data.photoAge}`}
          </p>
        </div>
        <p>
          <span className="text-muted-foreground">511: </span>
          {data.condition}
        </p>
        {data.weather && (
          <p className="text-muted-foreground">{data.weather}</p>
        )}
        <p>
          <span className="text-muted-foreground">Auto: </span>
          <span className="font-medium">
            {data.autoLabel ? ROAD_LABEL_NAMES[data.autoLabel] : "none"}
          </span>
          <span className="text-muted-foreground">
            {" "}
            ({data.autoLabelReason})
          </span>
        </p>

        <div
          className="grid grid-cols-3 gap-1"
          role="group"
          aria-label="Road label"
        >
          {ROAD_LABELS.map((label, i) => (
            <Button
              key={label}
              size="xs"
              variant={effective === label ? "default" : "outline"}
              aria-pressed={state.reviewed && state.human === label}
              disabled={pending}
              onClick={() => save(label)}
              title={`Key ${i + 1}`}
            >
              {ROAD_LABEL_NAMES[label]}
            </Button>
          ))}
          <Button
            size="xs"
            variant={
              state.reviewed && state.human === null ? "default" : "outline"
            }
            aria-pressed={state.reviewed && state.human === null}
            disabled={pending}
            onClick={() => save("none")}
            title="Key 0: none of these fits"
          >
            None fits
          </Button>
        </div>

        <div className="flex h-6 items-center justify-between">
          <span
            className={cn(
              "flex items-center gap-1",
              state.reviewed ? "text-status-live" : "text-muted-foreground"
            )}
          >
            {state.reviewed ? (
              <>
                <Check className="size-3.5" aria-hidden="true" />
                Reviewed
              </>
            ) : (
              "Not reviewed yet"
            )}
          </span>
          {state.reviewed && (
            <Button
              size="xs"
              variant="ghost"
              disabled={pending}
              onClick={() => save(null)}
            >
              <Undo2 aria-hidden="true" />
              Undo
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
