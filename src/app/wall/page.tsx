"use client"

import { Loader2 } from "lucide-react"
import dynamic from "next/dynamic"

// Client-only: the wall reads its config from the URL / localStorage on mount.
const WallClient = dynamic(() => import("@/components/app/wall/wall-client"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      Loading wall…
    </div>
  ),
})

export default function WallPage() {
  return <WallClient />
}
