import { Cctv } from "lucide-react"

export function Brand() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Cctv className="size-4" aria-hidden="true" />
      </span>
      <span className="text-sm font-semibold tracking-tight">CamAlberta</span>
    </div>
  )
}
