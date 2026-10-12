import { cn } from "@/lib/utils"

/** A photo older than this means the camera is frozen (STALE_PHOTO_MS). */
export const FROZEN_AFTER_S = 10 * 60

export function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86_400)}d ago`
}

/** The "● LIVE 23s ago" pill in the top-left corner of a camera view. */
export function LiveBadge({
  label,
  tone,
  detail = null,
}: {
  label: string
  tone: "live" | "stale"
  detail?: string | null
}) {
  const live = tone === "live"
  return (
    <span className="pointer-events-none absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium tracking-wide text-white uppercase">
      <span className="relative flex size-2">
        {live && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-live opacity-75 motion-reduce:hidden" />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            live ? "bg-status-live" : "bg-status-stale"
          )}
        />
      </span>
      {label}
      {detail && (
        <span className="font-mono normal-case opacity-80">{detail}</span>
      )}
    </span>
  )
}
