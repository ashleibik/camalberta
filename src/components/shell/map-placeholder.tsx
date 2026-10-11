import { MapPin, MountainSnow } from "lucide-react"

import { Button } from "@/components/ui/button"

export function MapPlaceholder() {
  return (
    <div
      role="region"
      aria-label="Camera map"
      className="relative h-full w-full overflow-hidden bg-muted/40"
    >
      {/* Faint grid so the empty map area reads as a canvas. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:48px_48px]"
      />

      <div className="absolute top-3 right-3">
        <Button variant="outline" size="sm" disabled>
          <MountainSnow aria-hidden="true" />
          Fly to Banff
        </Button>
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
        <MapPin className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">Map</p>
        <p className="font-mono text-xs text-muted-foreground">
          51.0447° N, 114.0719° W
        </p>
      </div>
    </div>
  )
}
