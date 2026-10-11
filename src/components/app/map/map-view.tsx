"use client"

import { MountainSnow } from "lucide-react"
import * as maplibregl from "maplibre-gl"
import type {
  GeoJSONSource,
  LngLatLike,
  MapGeoJSONFeature,
  MapLayerMouseEvent,
} from "maplibre-gl"
import { useTheme } from "next-themes"
import { useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"

import { useAppState } from "../app-state"
import { useVisibleCameras } from "../use-visible-cameras"
import {
  BANFF_CENTER,
  CALGARY_CENTER,
  camerasToGeoJSON,
  STATUS_COLORS,
  styleUrl,
} from "./geo"

import "maplibre-gl/dist/maplibre-gl.css"

// Load MapLibre's worker from our own origin (copied into public/ by
// scripts/copy-maplibre-worker.mjs). MapLibre's default worker URL isn't
// served by Turbopack dev, which leaves the map stuck "not loaded".
if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs")
}

const SOURCE_ID = "cameras"

function addCameraLayers(
  map: maplibregl.Map,
  data: GeoJSON.GeoJSON,
  selectedId: string | null
) {
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data,
      cluster: true,
      clusterRadius: 50,
      clusterMaxZoom: 14,
    })
  }

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: SOURCE_ID,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "step",
        ["get", "point_count"],
        "#3f3f46",
        10,
        "#52525b",
        30,
        "#71717a",
      ],
      "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 30, 24],
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "rgba(255,255,255,0.35)",
    },
  })

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: SOURCE_ID,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
    },
    paint: { "text-color": "#fafafa" },
  })

  map.addLayer({
    id: "unclustered",
    type: "circle",
    source: SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "match",
        ["get", "status"],
        "live",
        STATUS_COLORS.live,
        "stale",
        STATUS_COLORS.stale,
        "offline",
        STATUS_COLORS.offline,
        STATUS_COLORS.unknown,
      ],
      "circle-radius": 6,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#09090b",
    },
  })

  map.addLayer({
    id: "selected-ring",
    type: "circle",
    source: SOURCE_ID,
    filter: ["==", ["get", "id"], selectedId ?? "\u0000"],
    paint: {
      "circle-radius": 10,
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-width": 3,
      "circle-stroke-color": "#fafafa",
    },
  })
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const readyRef = useRef(false)

  const { resolvedTheme } = useTheme()
  const { visible } = useVisibleCameras()
  const { selectedId, setSelectedId } = useAppState()

  // Latest values for use inside the once-bound map event handlers.
  const dataRef = useRef<GeoJSON.GeoJSON>(camerasToGeoJSON([]))
  const selectRef = useRef(setSelectedId)
  const selectedIdRef = useRef<string | null>(null)

  useEffect(() => {
    dataRef.current = camerasToGeoJSON(visible)
    selectRef.current = setSelectedId
    selectedIdRef.current = selectedId
  })

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches

  // Initialize the map once.
  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(resolvedTheme),
      center: CALGARY_CENTER,
      zoom: 10,
      attributionControl: false,
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
      closeOnClick: false,
      offset: 10,
    })

    map.on("load", () => {
      addCameraLayers(map, dataRef.current, selectedIdRef.current)
      readyRef.current = true
    })

    // Cluster click: zoom in.
    map.on("click", "clusters", (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0]
      if (!feature) return
      const clusterId = feature.properties.cluster_id as number
      const source = map.getSource(SOURCE_ID) as GeoJSONSource
      void source.getClusterExpansionZoom(clusterId).then((zoom) => {
        const point = feature.geometry as GeoJSON.Point
        map.easeTo({
          center: point.coordinates as LngLatLike,
          zoom,
          duration: prefersReducedMotion ? 0 : 400,
        })
      })
    })

    // Marker click: select the camera.
    map.on("click", "unclustered", (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0]
      if (!feature) return
      const id = (feature.properties as { id?: string }).id
      if (id) selectRef.current(id)
    })

    // Hover tooltip (text only; never HTML, so names are safe).
    const showTip = (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0] as MapGeoJSONFeature | undefined
      if (!feature) return
      map.getCanvas().style.cursor = "pointer"
      const point = feature.geometry as GeoJSON.Point
      const name = (feature.properties as { name?: string }).name ?? ""
      popup
        .setLngLat(point.coordinates as LngLatLike)
        .setText(name)
        .addTo(map)
    }
    map.on("mousemove", "unclustered", showTip)
    map.on("mouseleave", "unclustered", () => {
      map.getCanvas().style.cursor = ""
      popup.remove()
    })
    map.on("mouseenter", "clusters", () => {
      map.getCanvas().style.cursor = "pointer"
    })
    map.on("mouseleave", "clusters", () => {
      map.getCanvas().style.cursor = ""
    })

    // Keep the map sized to its container (e.g. when the detail panel toggles).
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      popup.remove()
      map.remove()
      mapRef.current = null
      readyRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once; live values come through refs
  }, [])

  // Push filtered cameras into the source whenever they change (no refetch).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined
    if (source) source.setData(camerasToGeoJSON(visible))
  }, [visible])

  // Highlight the selected camera and ease to it.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    if (map.getLayer("selected-ring")) {
      map.setFilter("selected-ring", [
        "==",
        ["get", "id"],
        selectedId ?? "\u0000",
      ])
    }
    if (!selectedId) return
    const camera = visible.find((c) => c.id === selectedId)
    if (camera) {
      map.easeTo({
        center: [camera.lng, camera.lat],
        duration: prefersReducedMotion ? 0 : 500,
      })
    }
  }, [selectedId, visible, prefersReducedMotion])

  // Swap the basemap on theme change and re-add our layers.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    map.setStyle(styleUrl(resolvedTheme))
    map.once("styledata", () => {
      addCameraLayers(map, dataRef.current, selectedIdRef.current)
    })
  }, [resolvedTheme])

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute top-3 right-3">
        <Button
          variant="outline"
          size="sm"
          className="shadow-sm"
          onClick={() =>
            mapRef.current?.flyTo({
              center: BANFF_CENTER,
              zoom: 11,
              duration: prefersReducedMotion ? 0 : 2000,
            })
          }
        >
          <MountainSnow aria-hidden="true" />
          Fly to Banff
        </Button>
      </div>
    </div>
  )
}
