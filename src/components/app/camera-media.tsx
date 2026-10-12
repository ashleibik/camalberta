"use client"

import { isVideoSource, sourceFromId } from "@/lib/media"

import { LiveSnapshot } from "./live-snapshot"
import { LiveVideo } from "./live-video"

interface CameraMediaProps {
  id: string
  name: string
  active?: boolean
  showTiming?: boolean
  showControls?: boolean
  className?: string
}

/**
 * The right live view for a camera: a self-refreshing photo, or live video for
 * video sources. The source comes from the id itself (`<source>:<sourceId>`),
 * so this works before the camera list has loaded.
 */
export function CameraMedia(props: CameraMediaProps) {
  const source = sourceFromId(props.id)
  return source && isVideoSource(source) ? (
    <LiveVideo {...props} />
  ) : (
    <LiveSnapshot {...props} />
  )
}
