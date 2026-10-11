import { Camera, Search } from "lucide-react"

import { Brand } from "@/components/shell/brand"
import { ThemeToggle } from "@/components/theme-toggle"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const AREAS = ["All", "Calgary", "Bow Valley"] as const

export function Sidebar({ className }: { className?: string }) {
  return (
    <aside
      aria-label="Cameras"
      className={cn("flex-col bg-sidebar text-sidebar-foreground", className)}
    >
      <div className="flex h-14 items-center justify-between px-4">
        <Brand />
        <ThemeToggle />
      </div>

      <div className="px-4 pb-3">
        <label htmlFor="camera-search" className="sr-only">
          Search cameras
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="camera-search"
            type="search"
            placeholder="Search cameras or roads"
            className="pr-12 pl-8"
            disabled
          />
          <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
            Ctrl K
          </kbd>
        </div>
      </div>

      <Separator />

      <section aria-labelledby="filters-heading" className="space-y-2 p-4">
        <h2
          id="filters-heading"
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          Area
        </h2>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {AREAS.map((area, index) => (
            <span
              key={area}
              className={cn(
                "rounded-md px-2 py-1 text-center text-xs",
                index === 0
                  ? "bg-background font-medium shadow-xs"
                  : "text-muted-foreground"
              )}
            >
              {area}
            </span>
          ))}
        </div>
      </section>

      <Separator />

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <Camera className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">No cameras yet</p>
          <p className="text-xs text-muted-foreground">
            Camera data arrives once the first sync runs.
          </p>
        </div>
      </ScrollArea>
    </aside>
  )
}
