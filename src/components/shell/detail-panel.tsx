import { Video } from "lucide-react"

import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

export function DetailPanel({ className }: { className?: string }) {
  return (
    <aside
      aria-label="Camera details"
      className={cn("flex-col bg-sidebar text-sidebar-foreground", className)}
    >
      <div className="flex h-14 items-center px-4">
        <h2 className="text-sm font-semibold">Camera details</h2>
      </div>
      <Separator />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed bg-muted/40">
          <Video className="size-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Select a camera on the map to see its live snapshot.
        </p>
      </div>
    </aside>
  )
}
