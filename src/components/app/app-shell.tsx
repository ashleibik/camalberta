"use client"

import { LayoutGrid, SlidersHorizontal } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { Brand } from "@/components/shell/brand"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useMediaQuery } from "@/lib/client/use-media-query"

import { useAppState } from "./app-state"
import { CommandPalette } from "./command-palette"
import { DetailContent } from "./detail-content"
import { CameraMap } from "./map"
import { SidebarContent } from "./sidebar-content"
import { StatusBar } from "./status-bar"

function WallLink() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="ghost" size="icon" aria-label="Camera wall">
          <Link href="/wall">
            <LayoutGrid aria-hidden="true" />
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Camera wall</TooltipContent>
    </Tooltip>
  )
}

export function AppShell() {
  const { selectedId, setSelectedId } = useAppState()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isWideDetail = useMediaQuery("(min-width: 1280px)")

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Mobile header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b bg-sidebar px-3 md:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSidebarOpen(true)}
          >
            <SlidersHorizontal aria-hidden="true" />
            Cameras
          </Button>
          <WallLink />
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside
          aria-label="Cameras"
          className="hidden w-80 shrink-0 flex-col border-r bg-sidebar md:flex"
        >
          <div className="flex h-14 items-center justify-between px-4">
            <Brand />
            <div className="flex items-center gap-1">
              <WallLink />
              <ThemeToggle />
            </div>
          </div>
          <Separator />
          <SidebarContent className="flex-1" />
        </aside>

        <main className="relative min-w-0 flex-1">
          <CameraMap />
        </main>

        {/* Desktop detail panel */}
        <aside
          aria-label="Camera details"
          className="hidden w-96 shrink-0 flex-col border-l bg-sidebar xl:flex"
        >
          <div className="flex h-14 items-center px-4">
            <h2 className="text-sm font-semibold">Camera details</h2>
          </div>
          <Separator />
          {/* Below xl this panel is hidden (the sheet shows details instead),
              so don't let it load photos or stream video in the background. */}
          <DetailContent mediaActive={isWideDetail} />
        </aside>
      </div>

      <StatusBar />

      {/* Mobile sidebar as a bottom sheet */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="bottom" className="h-[85dvh] gap-0 p-0">
          <SheetHeader className="border-b text-left">
            <SheetTitle>Cameras</SheetTitle>
            <SheetDescription className="sr-only">
              Search and filter cameras
            </SheetDescription>
          </SheetHeader>
          <SidebarContent
            className="flex-1"
            onNavigate={() => setSidebarOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Detail as a bottom sheet below the xl breakpoint */}
      <Sheet
        open={!isWideDetail && selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null)
        }}
      >
        <SheetContent side="bottom" className="h-[85dvh] gap-0 p-0">
          <SheetHeader className="border-b text-left">
            <SheetTitle>Camera details</SheetTitle>
            <SheetDescription className="sr-only">
              Selected camera snapshot and details
            </SheetDescription>
          </SheetHeader>
          <DetailContent onClose={() => setSelectedId(null)} />
        </SheetContent>
      </Sheet>

      <CommandPalette />
    </div>
  )
}
