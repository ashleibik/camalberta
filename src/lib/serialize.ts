import type { CameraFeature, PublicCamera } from "@/lib/api-types"
import type { Camera } from "@/lib/db/schema"

/** DB row -> client camera, dropping the upstream image URL. */
export function toPublicCamera(camera: Camera): PublicCamera {
  return {
    id: camera.id,
    source: camera.source,
    sourceId: camera.sourceId,
    name: camera.name,
    road: camera.road,
    direction: camera.direction,
    quadrant: camera.quadrant,
    area: camera.area,
    lat: camera.lat,
    lng: camera.lng,
    status: camera.status,
    lastSeenAt: camera.lastSeenAt.toISOString(),
    updatedAt: camera.updatedAt.toISOString(),
  }
}

/** DB row -> compact GeoJSON point feature for the map. */
export function toFeature(camera: Camera): CameraFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [camera.lng, camera.lat] },
    properties: {
      id: camera.id,
      name: camera.name,
      source: camera.source,
      area: camera.area,
      status: camera.status,
      quadrant: camera.quadrant,
      direction: camera.direction,
      road: camera.road,
    },
  }
}
