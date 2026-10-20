import { useId } from "react"

import type { TripReport, TripRuleLevel } from "@/lib/api-types"
import { haversineM, type LngLat } from "@/lib/trip/geo"
import { cn } from "@/lib/utils"

/**
 * A lightweight drawing of the route: the line, each road segment coloured by
 * its level, events and cameras, and a few town names. Plain SVG from the
 * report already on the page, so it costs nothing to load. The interactive
 * MapLibre map (1 MB) replaces it only when someone asks for it.
 */

const SEGMENT_STROKE: Record<TripRuleLevel, string> = {
  green: "stroke-status-live",
  yellow: "stroke-status-stale",
  red: "stroke-status-offline",
  info: "stroke-muted-foreground",
}

const EVENT_FILL: Record<TripRuleLevel, string> = {
  green: "fill-status-live",
  yellow: "fill-status-stale",
  red: "fill-status-offline",
  info: "fill-muted-foreground",
}

/** The point a given distance along a line (clamped to its ends). */
function pointAtKm(line: readonly LngLat[], km: number): LngLat {
  let remaining = km * 1000
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!
    const b = line[i]!
    const edge = haversineM(a, b)
    if (remaining <= edge && edge > 0) {
      const t = remaining / edge
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }
    remaining -= edge
  }
  return line.at(-1)!
}

/** Town labels spread out along the route: both ends plus a few between. */
function pickLabels(
  places: TripReport["route"]["places"],
  lengthKm: number
): TripReport["route"]["places"] {
  if (places.length === 0) return []
  const first = places[0]!
  const last = places.at(-1)!
  const picked = [first]
  for (const place of places.slice(1, -1)) {
    const previous = picked.at(-1)!
    if (
      place.km - previous.km >= lengthKm / 3 &&
      last.km - place.km >= lengthKm / 5
    ) {
      picked.push(place)
    }
  }
  if (last !== first) picked.push(last)
  return picked
}

export function RoutePreview({
  report,
  className,
}: {
  report: TripReport
  className?: string
}) {
  const titleId = useId()
  const line = report.route.coordinates
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const [lng, lat] of line) {
    minLng = Math.min(minLng, lng)
    maxLng = Math.max(maxLng, lng)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }
  // Equirectangular around the middle latitude: true to shape at this scale.
  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
  const width = (maxLng - minLng) * kx
  const height = maxLat - minLat
  const size = Math.max(width, height)
  const pad = size * 0.12
  const xy = ([lng, lat]: LngLat): [number, number] => [
    (lng - minLng) * kx,
    maxLat - lat,
  ]
  const toPath = (points: readonly LngLat[]) =>
    points
      .map((p, i) => {
        const [x, y] = xy(p)
        return `${i === 0 ? "M" : "L"}${x.toFixed(4)} ${y.toFixed(4)}`
      })
      .join("")

  const routePath = toPath(line)
  const markerR = size * 0.014
  const fontSize = size * 0.042
  const labels = pickLabels(report.route.places, report.trip.lengthKm)
  const events = report.events.filter((e) => e.level !== "info")

  return (
    <svg
      role="img"
      aria-labelledby={titleId}
      viewBox={`${-pad} ${-pad} ${width + 2 * pad} ${height + 2 * pad}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn("size-full overflow-visible", className)}
    >
      <title id={titleId}>
        {`Route map of ${report.trip.name}: ${report.segments.length} road reports, ${events.length} events and ${report.cameras.length} camera views along ${Math.round(report.trip.lengthKm)} km.`}
      </title>

      <path
        d={routePath}
        className="fill-none stroke-background"
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={routePath}
        className="fill-none stroke-muted-foreground/60"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {report.segments.map((segment) =>
        segment.path.map((part, i) => (
          <path
            key={`${segment.id}-${i}`}
            d={toPath(part)}
            className={cn("fill-none", SEGMENT_STROKE[segment.level])}
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))
      )}

      {report.cameras.map((camera) => {
        const [x, y] = xy([camera.lng, camera.lat])
        return (
          <circle
            key={camera.id}
            cx={x}
            cy={y}
            r={markerR * 0.7}
            className="fill-background stroke-foreground"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        )
      })}

      {events.map((event) => {
        const [x, y] = xy([event.lng, event.lat])
        return (
          <g key={event.id}>
            <circle
              cx={x}
              cy={y}
              r={markerR * 1.2}
              className={cn("stroke-background", EVENT_FILL[event.level])}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={x}
              y={y}
              dy="0.36em"
              textAnchor="middle"
              fontSize={markerR * 1.8}
              fontWeight={700}
              className="fill-black"
            >
              !
            </text>
          </g>
        )
      })}

      {labels.map((place) => {
        const [x, y] = xy(pointAtKm(line, place.km))
        // Labels on the eastern side read leftwards, so they stay in view.
        const rightSide = x > width * 0.6
        return (
          <g key={place.name}>
            <circle
              cx={x}
              cy={y}
              r={markerR * 0.45}
              className="fill-foreground"
            />
            <text
              x={rightSide ? x - markerR * 1.4 : x + markerR * 1.4}
              y={y}
              dy="0.35em"
              textAnchor={rightSide ? "end" : "start"}
              fontSize={fontSize}
              className="fill-foreground stroke-background font-medium"
              strokeWidth={3}
              paintOrder="stroke"
              vectorEffect="non-scaling-stroke"
            >
              {place.name}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
