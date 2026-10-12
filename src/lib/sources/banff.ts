import "server-only"

import { classifyArea } from "./areas"
import { SOURCE_IMAGE_HOSTS } from "./hosts"
import { buildId, type Adapter, type NormalizedCamera } from "./types"

const IMAGE_HOST = SOURCE_IMAGE_HOSTS.banff

// The Town of Banff publishes its street cameras as plain JPEGs on
// https://banff.ca/trafficcams, with no feed and no coordinates. This list
// mirrors that page (checked 2026-10-12). Positions are the named
// intersections and landmarks in OpenStreetMap, so they are approximate. Where
// one pole has two cameras facing different ways, the second is nudged ~8m so
// both markers stay clickable.
interface BanffCamera {
  /** Image file name on ftp.banff.ca/images/. */
  file: string
  name: string
  road: string | null
  direction: string | null
  lat: number
  lng: number
}

export const BANFF_CAMERAS: readonly BanffCamera[] = [
  {
    file: "Banff_Caribou.jpg",
    name: "Banff Ave at Caribou St, looking north",
    road: "Banff Avenue",
    direction: "North",
    lat: 51.176607,
    lng: -115.570841,
  },
  {
    file: "Banff_Moose.jpg",
    name: "Banff Ave at Moose St, looking south",
    road: "Banff Avenue",
    direction: "South",
    lat: 51.180891,
    lng: -115.568862,
  },
  {
    file: "Banff_Ave_Buffalo.jpg",
    name: "Banff Ave at Buffalo St, looking south",
    road: "Banff Avenue",
    direction: "South",
    lat: 51.174384,
    lng: -115.571149,
  },
  {
    file: "Bow_River_Bridge.jpg",
    name: "Spray Ave, looking north over the Banff Ave bridge",
    road: "Banff Avenue",
    direction: "North",
    lat: 51.17221,
    lng: -115.571254,
  },
  {
    file: "spray-west.jpg",
    name: "Spray Ave at Mountain Ave, looking up toward Sulphur Mountain",
    road: "Mountain Avenue",
    direction: "South",
    lat: 51.171025,
    lng: -115.569572,
  },
  {
    file: "spray-west-01.jpg",
    name: "Spray Ave, looking east toward the Banff Springs",
    road: "Spray Avenue",
    direction: "East",
    lat: 51.171025,
    lng: -115.569452,
  },
  {
    file: "BSH_Photo.jpg",
    name: "Spray Ave at Rundle Ave, looking south toward the Banff Springs",
    road: "Spray Avenue",
    direction: "South",
    lat: 51.166839,
    lng: -115.565817,
  },
  {
    file: "Middle_Springs_Photo.jpg",
    name: "Mountain Ave at Middle Springs, looking up toward the Gondola",
    road: "Mountain Avenue",
    direction: "South",
    lat: 51.166539,
    lng: -115.577445,
  },
  {
    file: "Valleyview_Photo.jpg",
    name: "Mountain Ave at Middle Springs, looking down toward downtown",
    road: "Mountain Avenue",
    direction: "North",
    lat: 51.166611,
    lng: -115.577445,
  },
  {
    file: "rimrock-south.jpg",
    name: "Mountain Ave at the Rimrock Hotel, looking south",
    road: "Mountain Avenue",
    direction: "South",
    lat: 51.151709,
    lng: -115.560177,
  },
  {
    file: "rimrock-north.jpg",
    name: "Mountain Ave at the Rimrock Hotel, looking north",
    road: "Mountain Avenue",
    direction: "North",
    lat: 51.151781,
    lng: -115.560177,
  },
  {
    file: "Wolf_Lynx.jpg",
    name: "Lynx St at Wolf St, looking south",
    road: "Lynx Street",
    direction: "South",
    lat: 51.17846,
    lng: -115.574269,
  },
  {
    file: "bear-st-mid-ptz.jpg",
    name: "Bear St, looking south",
    road: "Bear Street",
    direction: "South",
    lat: 51.17756,
    lng: -115.57238,
  },
  {
    file: "Norquay_North.jpg",
    name: "Mt Norquay Rd at the Fenlands, looking north toward the highway",
    road: "Mount Norquay Road",
    direction: "North",
    lat: 51.183,
    lng: -115.58035,
  },
  {
    file: "Norquay_South.jpg",
    name: "Mt Norquay Rd at the Fenlands, looking south toward downtown",
    road: "Mount Norquay Road",
    direction: "South",
    lat: 51.18293,
    lng: -115.58035,
  },
  {
    file: "train-w.jpg",
    name: "Train station parking lot, near the entrance",
    road: "Railway Avenue",
    direction: null,
    lat: 51.181753,
    lng: -115.576155,
  },
  {
    file: "train-e.jpg",
    name: "Train station parking lot, looking east",
    road: "Railway Avenue",
    direction: "East",
    lat: 51.181753,
    lng: -115.576035,
  },
]

/** `Banff_Ave_Buffalo.jpg` -> `banff-ave-buffalo` (fits our id format). */
export function banffSourceId(file: string): string {
  return file
    .replace(/\.jpg$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function normalizeBanff(
  list: readonly BanffCamera[] = BANFF_CAMERAS
): NormalizedCamera[] {
  const cameras: NormalizedCamera[] = []
  const seen = new Set<string>()

  for (const cam of list) {
    if (!/^[A-Za-z0-9_.-]+\.jpg$/.test(cam.file)) continue
    const sourceId = banffSourceId(cam.file)
    if (!sourceId || seen.has(sourceId)) continue
    const area = classifyArea(cam.lat, cam.lng)
    if (!area) continue

    seen.add(sourceId)
    cameras.push({
      id: buildId("banff", sourceId),
      source: "banff",
      sourceId,
      name: cam.name,
      road: cam.road,
      direction: cam.direction,
      quadrant: null,
      area,
      lat: cam.lat,
      lng: cam.lng,
      imageUrl: `https://${IMAGE_HOST}/images/${cam.file}`,
    })
  }

  return cameras
}

export const banffAdapter: Adapter = {
  source: "banff",
  // A curated list, so there is nothing to download. The image proxy marks a
  // camera stale if the Town ever stops serving its picture.
  async fetch() {
    return normalizeBanff()
  },
}
