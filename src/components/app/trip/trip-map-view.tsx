"use client"

import * as maplibregl from "maplibre-gl"
import type { GeoJSONSource, LngLatLike, MapLayerMouseEvent } from "maplibre-gl"
import { useTheme } from "next-themes"
import { useEffect, useRef } from "react"

import type { TripReport } from "@/lib/api-types"

import { useAppState } from "../app-state"
import { styleUrl } from "../map/geo"
import { LEVEL_HEX } from "./levels"

import "maplibre-gl/dist/maplibre-gl.css"

// Same self-hosted worker as the main map (see map-view.tsx).
if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs")
}

type Collection = GeoJSON.FeatureCollection

function routeData(report: TripReport): Collection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: report.route.coordinates },
      },
    ],
  }
}

function segmentData(report: TripReport): Collection {
  return {
    type: "FeatureCollection",
    features: report.segments.map((s) => ({
      type: "Feature",
      properties: { level: s.level },
      geometry: { type: "MultiLineString", coordinates: s.path },
    })),
  }
}

function eventData(report: TripReport): Collection {
  return {
    type: "FeatureCollection",
    features: report.events
      .filter((e) => e.level !== "info")
      .map((e) => ({
        type: "Feature",
        properties: {
          level: e.level,
          label: `${e.label}${e.direction ? ` (${e.direction})` : ""} · km ${Math.round(e.km)}`,
        },
        geometry: { type: "Point", coordinates: [e.lng, e.lat] },
      })),
  }
}

function cameraData(report: TripReport): Collection {
  return {
    type: "FeatureCollection",
    features: report.cameras.map((c) => ({
      type: "Feature",
      properties: { id: c.id, name: `${c.name} · km ${Math.round(c.km)}` },
      geometry: { type: "Point", coordinates: [c.lng, c.lat] },
    })),
  }
}

function bounds(report: TripReport): maplibregl.LngLatBounds {
  const b = new maplibregl.LngLatBounds()
  for (const point of report.route.coordinates) b.extend(point)
  return b
}

const levelColor: maplibregl.ExpressionSpecification = [
  "match",
  ["get", "level"],
  "red",
  LEVEL_HEX.red,
  "yellow",
  LEVEL_HEX.yellow,
  "green",
  LEVEL_HEX.green,
  LEVEL_HEX.info,
]

function addLayers(map: maplibregl.Map, report: TripReport, dark: boolean) {
  map.addSource("route", { type: "geojson", data: routeData(report) })
  map.addSource("segments", { type: "geojson", data: segmentData(report) })
  map.addSource("events", { type: "geojson", data: eventData(report) })
  map.addSource("cameras", { type: "geojson", data: cameraData(report) })

  map.addLayer({
    id: "route-casing",
    type: "line",
    source: "route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": dark ? "#09090b" : "#ffffff", "line-width": 8 },
  })
  map.addLayer({
    id: "route-line",
    type: "line",
    source: "route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#71717a", "line-width": 4 },
  })
  map.addLayer({
    id: "segments",
    type: "line",
    source: "segments",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": levelColor, "line-width": 4 },
  })
  map.addLayer({
    id: "cameras",
    type: "circle",
    source: "cameras",
    paint: {
      "circle-radius": 4.5,
      "circle-color": dark ? "#09090b" : "#ffffff",
      "circle-stroke-width": 2,
      "circle-stroke-color": dark ? "#fafafa" : "#18181b",
    },
  })
  map.addLayer({
    id: "events",
    type: "circle",
    source: "events",
    paint: {
      "circle-radius": 8,
      "circle-color": levelColor,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": dark ? "#09090b" : "#ffffff",
    },
  })
  map.addLayer({
    id: "events-mark",
    type: "symbol",
    source: "events",
    layout: {
      "text-field": "!",
      "text-font": ["Noto Sans Bold"],
      "text-size": 12,
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#09090b" },
  })
}

export default function TripMapView({ report }: { report: TripReport }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const readyRef = useRef(false)
  const reportRef = useRef(report)
  const { resolvedTheme } = useTheme()
  const { setSelectedId } = useAppState()
  const selectRef = useRef(setSelectedId)
  const dark = resolvedTheme !== "light"
  const darkRef = useRef(dark)

  useEffect(() => {
    reportRef.current = report
    selectRef.current = setSelectedId
    darkRef.current = dark
  })

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(resolvedTheme),
      bounds: bounds(reportRef.current),
      fitBoundsOptions: { padding: 28 },
      attributionControl: false,
      // Phones: one finger scrolls the page, two fingers move the map.
      cooperativeGestures: true,
    })
    mapRef.current = map
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-left"
    )
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right"
    )

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: true,
      offset: 10,
    })

    map.on("load", () => {
      addLayers(map, reportRef.current, darkRef.current)
      readyRef.current = true
    })

    map.on("click", "cameras", (e: MapLayerMouseEvent) => {
      const id = (e.features?.[0]?.properties as { id?: string } | undefined)
        ?.id
      if (id) selectRef.current(id)
    })

    // Labels are set as text, never HTML.
    const showLabel = (e: MapLayerMouseEvent, key: "name" | "label") => {
      const feature = e.features?.[0]
      if (!feature) return
      map.getCanvas().style.cursor = "pointer"
      const point = feature.geometry as GeoJSON.Point
      const text = (feature.properties as Record<string, unknown>)[key]
      popup
        .setLngLat(point.coordinates as LngLatLike)
        .setText(typeof text === "string" ? text : "")
        .addTo(map)
    }
    map.on("mousemove", "cameras", (e) => showLabel(e, "name"))
    map.on("mousemove", "events", (e) => showLabel(e, "label"))
    map.on("click", "events", (e) => showLabel(e, "label"))
    for (const layer of ["cameras", "events"]) {
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = ""
        popup.remove()
      })
    }

    const observer = new ResizeObserver(() => map.resize())
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      popup.remove()
      map.remove()
      mapRef.current = null
      readyRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- create once; live values come through refs
  }, [])

  // New data (a refresh or another trip): update the sources, and refit when
  // the route itself changed.
  const tripId = report.trip.id
  const lastTripRef = useRef(tripId)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    ;(map.getSource("route") as GeoJSONSource | undefined)?.setData(
      routeData(report)
    )
    ;(map.getSource("segments") as GeoJSONSource | undefined)?.setData(
      segmentData(report)
    )
    ;(map.getSource("events") as GeoJSONSource | undefined)?.setData(
      eventData(report)
    )
    ;(map.getSource("cameras") as GeoJSONSource | undefined)?.setData(
      cameraData(report)
    )
    if (lastTripRef.current !== tripId) {
      lastTripRef.current = tripId
      map.fitBounds(bounds(report), {
        padding: 28,
        duration: prefersReducedMotion ? 0 : 800,
      })
    }
  }, [report, tripId, prefersReducedMotion])

  // Theme change: swap the basemap and re-add our layers.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    map.setStyle(styleUrl(resolvedTheme))
    map.once("styledata", () =>
      addLayers(map, reportRef.current, darkRef.current)
    )
  }, [resolvedTheme])

  return (
    <div
      ref={containerRef}
      className="size-full"
      role="region"
      aria-label={`Map of ${report.trip.name}`}
    />
  )
}
