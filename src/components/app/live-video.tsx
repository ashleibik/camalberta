"use client"

import type Hls from "hls.js"
import { Loader2, Maximize, RotateCw } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { cameraLiveUrl } from "@/lib/client/api"
import { useRefreshRequests } from "@/lib/client/refresh"
import { cn } from "@/lib/utils"

import { LiveBadge } from "./live-badge"

const HLS_MIME = "application/vnd.apple.mpegurl"
const RETRY_DELAY_MS = 5_000

type Phase = "connecting" | "playing" | "buffering" | "error"

/**
 * A live video camera (HLS), played from our own relay at
 * /api/cam/[id]/live. Safari plays HLS natively; other browsers load hls.js
 * (light build) on demand. Downloads stop while the tab is hidden and the
 * player rejoins at the live edge when it comes back.
 */
export function LiveVideo({
  id,
  name,
  active = true,
  showTiming = false,
  showControls = true,
  className,
}: {
  id: string
  name: string
  active?: boolean
  /** Show a short "live video" note under the player. */
  showTiming?: boolean
  /** Show reconnect / full screen buttons (wall tiles bring their own). */
  showControls?: boolean
  className?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [phase, setPhase] = useState<Phase>("connecting")
  // Bumped to tear the player down and reconnect at the live edge.
  const [session, setSession] = useState(0)

  const reconnect = useCallback(() => {
    setPhase("connecting")
    setSession((n) => n + 1)
  }, [])

  useRefreshRequests(id, reconnect)

  useEffect(() => {
    const video = videoRef.current
    if (!active || !video) return
    let cancelled = false
    let hls: Hls | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    const src = cameraLiveUrl(id)

    const failAndRetry = () => {
      if (cancelled) return
      setPhase("error")
      clearTimeout(retry)
      retry = setTimeout(() => {
        setPhase("connecting")
        setSession((n) => n + 1)
      }, RETRY_DELAY_MS)
    }

    const onPlaying = () => setPhase("playing")
    const onWaiting = () => setPhase((p) => (p === "playing" ? "buffering" : p))
    video.addEventListener("playing", onPlaying)
    video.addEventListener("waiting", onWaiting)

    const start = async () => {
      // Safari and iOS play HLS natively.
      if (video.canPlayType(HLS_MIME)) {
        video.addEventListener("error", failAndRetry)
        video.src = src
        void video.play().catch(() => {})
        return
      }
      const { default: HlsJs } = await import("hls.js/light")
      if (cancelled) return
      if (!HlsJs.isSupported()) {
        setPhase("error")
        return
      }
      const player = new HlsJs({
        // Start ~2 segments (4s) behind live and jump ahead if we fall 4+
        // behind, so we never ask for segments that have left the window.
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 4,
        backBufferLength: 10,
      })
      hls = player
      player.on(HlsJs.Events.ERROR, (_event, data) => {
        if (!data.fatal) return
        if (data.type === HlsJs.ErrorTypes.MEDIA_ERROR) {
          player.recoverMediaError()
          return
        }
        player.destroy()
        if (hls === player) hls = null
        failAndRetry()
      })
      player.on(HlsJs.Events.MANIFEST_PARSED, () => {
        void video.play().catch(() => {})
      })
      player.loadSource(src)
      player.attachMedia(video)
    }
    start().catch(failAndRetry)

    // Stop downloading while the tab is hidden; rejoin at the live edge after.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        clearTimeout(retry)
        hls?.stopLoad()
        video.pause()
      } else {
        setPhase("connecting")
        setSession((n) => n + 1)
      }
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      cancelled = true
      clearTimeout(retry)
      document.removeEventListener("visibilitychange", onVisibility)
      video.removeEventListener("playing", onPlaying)
      video.removeEventListener("waiting", onWaiting)
      video.removeEventListener("error", failAndRetry)
      hls?.destroy()
      video.removeAttribute("src")
      video.load()
    }
  }, [id, active, session])

  const goFullscreen = () => {
    void videoRef.current?.requestFullscreen?.().catch(() => {})
  }

  const showing = phase === "playing" || phase === "buffering"

  return (
    <div className={className}>
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-black">
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          disablePictureInPicture
          aria-label={`Live video from ${name}`}
          className="h-full w-full object-cover"
        />

        {!showing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/90 text-center text-xs text-muted-foreground">
            {phase === "error" ? (
              <span>Live video unavailable. Retrying…</span>
            ) : (
              <>
                <Loader2
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                <span>Connecting to live video…</span>
              </>
            )}
          </div>
        )}

        {showing && <LiveBadge label="Live video" tone="live" />}
        {phase === "buffering" && (
          <span className="pointer-events-none absolute top-9 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
            Buffering…
          </span>
        )}

        {showControls && (
          <div className="absolute top-2 right-2 flex gap-1">
            <button
              type="button"
              onClick={reconnect}
              aria-label={`Reconnect to the live video from ${name}`}
              title="Reconnect (jump to live)"
              className={controlClass}
            >
              <RotateCw
                className={cn(
                  "size-3.5",
                  phase === "connecting" && "animate-spin"
                )}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              onClick={goFullscreen}
              disabled={!showing}
              aria-label={`Show the live video from ${name} full screen`}
              title="Full screen"
              className={controlClass}
            >
              <Maximize className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {phase === "error" ? "Live video unavailable, retrying" : ""}
      </p>
      {showTiming && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Real live video, a few seconds behind real time.
        </p>
      )}
    </div>
  )
}

const controlClass =
  "flex size-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-60"
