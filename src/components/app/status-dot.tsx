import type { CameraStatus } from "@/lib/db/schema"
import { cn } from "@/lib/utils"

const STATUS_BG: Record<CameraStatus, string> = {
  live: "bg-status-live",
  stale: "bg-status-stale",
  offline: "bg-status-offline",
}

export function StatusDot({
  status,
  className,
}: {
  status: CameraStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full",
        STATUS_BG[status],
        className
      )}
      aria-hidden="true"
    />
  )
}
