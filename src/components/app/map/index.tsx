"use client"

import { Loader2 } from "lucide-react"
import dynamic from "next/dynamic"

function MapLoading() {
  return (
    <div className="absolute inset-0 bg-muted/40" aria-busy="true">
      <div
        aria-hidden="true"
        className="absolute inset-0 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:48px_48px]"
      />
      <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Loading map…
      </div>
    </div>
  )
}

// MapLibre is large, so load it only on the client and keep it out of the
// initial bundle.
const MapView = dynamic(() => import("./map-view"), {
  ssr: false,
  loading: () => <MapLoading />,
})

export function CameraMap() {
  return <MapView />
}
