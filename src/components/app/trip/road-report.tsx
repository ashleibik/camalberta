"use client"

import { Thermometer, Wind } from "lucide-react"

import type { TripEvent, TripSegment, TripWeather } from "@/lib/api-types"
import { cn } from "@/lib/utils"

import { RULE_DOT } from "./levels"

const dateFormat = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
})
const timeFormat = new Intl.DateTimeFormat("en-CA", {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
})

function formatTemp(celsius: number | null): string | null {
  return celsius === null ? null : `${Math.round(celsius)}°C`
}

function WeatherLine({ weather }: { weather: TripWeather | null }) {
  if (!weather) {
    return (
      <p className="text-xs text-muted-foreground">No weather station nearby</p>
    )
  }
  const air = formatTemp(weather.airTempC)
  const road = formatTemp(weather.pavementTempC)
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {air && (
        <span className="flex items-center gap-1">
          <Thermometer className="size-3.5" aria-hidden="true" />
          <span>
            <span className="font-mono text-foreground">{air}</span> air
            {road && (
              <>
                , <span className="font-mono text-foreground">{road}</span> road
              </>
            )}
          </span>
        </span>
      )}
      {weather.windKmh !== null && (
        <span className="flex items-center gap-1">
          <Wind className="size-3.5" aria-hidden="true" />
          <span>
            <span className="font-mono text-foreground">
              {Math.round(weather.windKmh)}
            </span>{" "}
            km/h wind
          </span>
        </span>
      )}
      <span>at km {Math.round(weather.km)}</span>
    </p>
  )
}

export function ConditionList({
  segments,
}: {
  segments: readonly TripSegment[]
}) {
  return (
    <section aria-labelledby="conditions-heading">
      <h2 id="conditions-heading" className="mb-2 text-sm font-semibold">
        Road conditions
      </h2>
      {segments.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No road condition reports for this route yet.
        </p>
      ) : (
        <ol className="space-y-2">
          {segments.map((segment) => (
            <li
              key={segment.id}
              className="flex gap-3 rounded-lg border bg-card p-3"
            >
              <span
                className={cn(
                  "w-1 shrink-0 rounded-full",
                  RULE_DOT[segment.level]
                )}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">
                    {segment.roadway}
                    {segment.location && (
                      <span className="font-normal text-muted-foreground">
                        : {segment.location}
                      </span>
                    )}
                  </p>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    km {Math.round(segment.fromKm)}–{Math.round(segment.toKm)}
                  </span>
                </div>
                <p className="text-sm">
                  {segment.findings.map((finding, i) => (
                    <span key={`${finding.text}-${i}`}>
                      {i > 0 && (
                        <span className="text-muted-foreground"> · </span>
                      )}
                      <span
                        className={cn(
                          finding.level === "yellow" || finding.level === "red"
                            ? "font-medium"
                            : undefined
                        )}
                      >
                        {finding.text}
                      </span>
                    </span>
                  ))}
                </p>
                <WeatherLine weather={segment.weather} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function when(event: TripEvent): string {
  if (event.upcoming)
    return `Starts ${timeFormat.format(new Date(event.startsAt))}`
  if (event.endsAt) return `Until ${dateFormat.format(new Date(event.endsAt))}`
  return "Ongoing"
}

export function EventList({ events }: { events: readonly TripEvent[] }) {
  return (
    <section aria-labelledby="events-heading">
      <h2 id="events-heading" className="mb-2 text-sm font-semibold">
        Closures, incidents and construction
      </h2>
      {events.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Nothing reported on this route right now.
        </p>
      ) : (
        <ol className="space-y-2">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex gap-3 rounded-lg border bg-card p-3"
            >
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  RULE_DOT[event.level]
                )}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">
                    {event.label}
                    {event.direction && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {event.direction}
                      </span>
                    )}
                  </p>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    km {Math.round(event.km)}
                  </span>
                </div>
                <p className="line-clamp-3 text-xs text-muted-foreground">
                  {event.description}
                </p>
                <p className="text-xs">{when(event)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
