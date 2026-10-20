"use client"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useMediaQuery } from "@/lib/client/use-media-query"

import { useAppState } from "../app-state"
import { DetailContent } from "../detail-content"

/**
 * The existing camera detail panel, as a sheet over Trip Check. Loaded on
 * demand (see trip-check.tsx): it brings the dialog, live player and wall
 * helpers, which the first view of the page doesn't need.
 */
export default function CameraSheet() {
  const { selectedId, setSelectedId } = useAppState()
  const wide = useMediaQuery("(min-width: 768px)")
  return (
    <Sheet
      open={selectedId !== null}
      onOpenChange={(open) => {
        if (!open) setSelectedId(null)
      }}
    >
      <SheetContent
        side={wide ? "right" : "bottom"}
        className={wide ? "w-96 gap-0 p-0 sm:max-w-96" : "h-[85dvh] gap-0 p-0"}
      >
        <SheetHeader className="border-b text-left">
          <SheetTitle>Camera details</SheetTitle>
          <SheetDescription className="sr-only">
            Live view and details for the selected camera
          </SheetDescription>
        </SheetHeader>
        <DetailContent onClose={() => setSelectedId(null)} />
      </SheetContent>
    </Sheet>
  )
}
