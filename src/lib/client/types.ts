import type { CameraFeatureProperties } from "@/lib/api-types"

/** A camera flattened for the client: marker props plus coordinates. */
export interface ClientCamera extends CameraFeatureProperties {
  lng: number
  lat: number
}
