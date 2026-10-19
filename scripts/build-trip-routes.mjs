// Build the Trip Check route lines from OpenStreetMap data.
//
//   node scripts/build-trip-routes.mjs
//
// For each trip it asks the public OSRM router (which routes on OSM data) for
// the driving line, trims it to start where the highway leaves Calgary's ring
// road (and, for Edmonton, to end at Edmonton's), simplifies it, and looks up
// the towns along it with OSM's Nominatim geocoder so reasons can say "near
// Canmore". The result is committed as src/lib/trip/routes.json (GeoJSON), so
// the app never calls these services at runtime. Re-run only when a route
// should change. Both services ask for light use: 4 routes, ~30 lookups, one
// request per second.
//
// Route data © OpenStreetMap contributors (ODbL). See README > Data sources.
import { writeFileSync } from "node:fs"
import path from "node:path"

const OUT = path.join(
  import.meta.dirname,
  "..",
  "src",
  "lib",
  "trip",
  "routes.json"
)
const USER_AGENT = "CamAlberta route builder (open source school project)"
const OSRM = "https://router.project-osrm.org/route/v1/driving"
const NOMINATIM = "https://nominatim.openstreetmap.org/search"

// Simplification tolerance. Matching uses a 500 m corridor, so a few metres
// of error are irrelevant, and this keeps mountain curves.
const SIMPLIFY_M = 15

// Where each trip leaves Calgary: the highway's crossing of Stoney Trail
// (anchored on 511's own interchange cameras, "Stoney Trail West (near COP)"
// and "Stoney Trail / Deerfoot Trail NE"). Distances in the app count from
// here.
const CALGARY_HWY1 = [-114.2277, 51.0872]
const CALGARY_HWY2 = [-114.0002, 51.1748]
// Where Highway 2 (Gateway Blvd) meets Anthony Henday Drive, south Edmonton.
const EDMONTON_HENDAY = [-113.4925, 53.437]

// Lead-in points inside each city, so the router joins the highway the normal
// way before we trim at the ring road.
const DOWNTOWN_CALGARY = [-114.0719, 51.0447]
const DEERFOOT_NORTH = [-114.0015, 51.16]
const EDMONTON_SOUTHSIDE = [-113.49, 53.46]

const HWY1_PLACES = [
  "Calgary",
  "Cochrane",
  "Morley",
  "Exshaw",
  "Dead Man's Flats",
  "Canmore",
  "Banff",
  "Castle Junction",
  "Lake Louise",
]

const TRIPS = [
  {
    id: "canmore",
    name: "Calgary to Canmore",
    highway: "Highway 1",
    from: "Calgary (Hwy 1 at Stoney Trail)",
    to: "Canmore (Main Street)",
    waypoints: [DOWNTOWN_CALGARY, [-115.3592, 51.0893]],
    trimStart: CALGARY_HWY1,
    places: HWY1_PLACES,
  },
  {
    id: "banff",
    name: "Calgary to Banff",
    highway: "Highway 1",
    from: "Calgary (Hwy 1 at Stoney Trail)",
    to: "Banff (Banff Avenue)",
    waypoints: [DOWNTOWN_CALGARY, [-115.57084, 51.17799]],
    trimStart: CALGARY_HWY1,
    places: HWY1_PLACES,
  },
  {
    id: "lake-louise",
    name: "Calgary to Lake Louise",
    highway: "Highway 1",
    from: "Calgary (Hwy 1 at Stoney Trail)",
    to: "Lake Louise (village)",
    waypoints: [DOWNTOWN_CALGARY, [-116.1782, 51.4254]],
    trimStart: CALGARY_HWY1,
    places: HWY1_PLACES,
  },
  {
    id: "edmonton",
    name: "Calgary to Edmonton",
    highway: "Highway 2 (QEII)",
    from: "Calgary (Deerfoot Trail at Stoney Trail)",
    to: "Edmonton (Anthony Henday Drive)",
    waypoints: [DEERFOOT_NORTH, EDMONTON_SOUTHSIDE],
    trimStart: CALGARY_HWY2,
    trimEnd: EDMONTON_HENDAY,
    places: [
      "Calgary",
      "Airdrie",
      "Crossfield",
      "Carstairs",
      "Didsbury",
      "Olds",
      "Bowden",
      "Innisfail",
      "Penhold",
      "Red Deer",
      "Blackfalds",
      "Lacombe",
      "Ponoka",
      "Millet",
      "Leduc",
      "Nisku",
      "Edmonton",
    ],
  },
]

// A place counts as "on" a route if it's within this distance of the line.
// Towns sit a few km off the highway (Cochrane is ~10 km north of Hwy 1).
const PLACE_MAX_OFFSET_M = 15_000
// Trim points must lie on the route line (interchanges are wide).
const TRIM_MAX_OFFSET_M = 300

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function getJson(url) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } })
  if (!response.ok) throw new Error(`${url} -> ${response.status}`)
  return response.json()
}

// Local equirectangular projection around a reference latitude (metres).
// Accurate to well under 1% over a few hundred km at these latitudes.
function projector(refLat) {
  const R = 6_371_008.8
  const kx = (Math.PI / 180) * R * Math.cos((refLat * Math.PI) / 180)
  const ky = (Math.PI / 180) * R
  return ([lng, lat]) => [lng * kx, lat * ky]
}

function closestOnLine(line, point, project) {
  const p = project(point)
  let best = { index: 0, t: 0, distance: Infinity }
  for (let i = 0; i < line.length - 1; i++) {
    const a = project(line[i])
    const b = project(line[i + 1])
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len2 = dx * dx + dy * dy
    const t =
      len2 === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)
          )
    const x = a[0] + t * dx - p[0]
    const y = a[1] + t * dy - p[1]
    const distance = Math.hypot(x, y)
    if (distance < best.distance) best = { index: i, t, distance }
  }
  return best
}

function interpolate(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function trim(line, start, end, project) {
  let out = line
  if (start) {
    const c = closestOnLine(out, start, project)
    if (c.distance > TRIM_MAX_OFFSET_M)
      throw new Error(`trim start is ${c.distance} m off the route`)
    out = [
      interpolate(out[c.index], out[c.index + 1], c.t),
      ...out.slice(c.index + 1),
    ]
  }
  if (end) {
    const c = closestOnLine(out, end, project)
    if (c.distance > TRIM_MAX_OFFSET_M)
      throw new Error(`trim end is ${c.distance} m off the route`)
    out = [
      ...out.slice(0, c.index + 1),
      interpolate(out[c.index], out[c.index + 1], c.t),
    ]
  }
  return out
}

// Douglas-Peucker in projected metres (iterative, no recursion limit).
function simplify(line, tolerance, project) {
  const pts = line.map(project)
  const keep = new Uint8Array(line.length)
  keep[0] = keep[line.length - 1] = 1
  const stack = [[0, line.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()
    let maxDistance = 0
    let index = -1
    const [ax, ay] = pts[first]
    const [bx, by] = pts[last]
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy)
    for (let i = first + 1; i < last; i++) {
      const [px, py] = pts[i]
      const distance =
        len === 0
          ? Math.hypot(px - ax, py - ay)
          : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len
      if (distance > maxDistance) {
        maxDistance = distance
        index = i
      }
    }
    if (maxDistance > tolerance && index > 0) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }
  return line.filter((_, i) => keep[i])
}

function lengthM(line, project) {
  let total = 0
  for (let i = 1; i < line.length; i++) {
    const a = project(line[i - 1])
    const b = project(line[i])
    total += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return total
}

function alongM(line, point, project) {
  const c = closestOnLine(line, point, project)
  const before = lengthM(line.slice(0, c.index + 1), project)
  const a = project(line[c.index])
  const b = project(line[c.index + 1])
  return {
    along: before + c.t * Math.hypot(b[0] - a[0], b[1] - a[1]),
    offset: c.distance,
  }
}

const round5 = (n) => Math.round(n * 1e5) / 1e5

const placeCache = new Map()
async function geocode(name) {
  if (placeCache.has(name)) return placeCache.get(name)
  const url = new URL(NOMINATIM)
  url.searchParams.set("q", `${name}, Alberta, Canada`)
  url.searchParams.set("format", "jsonv2")
  url.searchParams.set("limit", "1")
  url.searchParams.set("countrycodes", "ca")
  await sleep(1100)
  const [hit] = await getJson(url)
  if (!hit) throw new Error(`No OSM result for ${name}`)
  const point = [Number(hit.lon), Number(hit.lat)]
  placeCache.set(name, point)
  return point
}

const features = []
for (const trip of TRIPS) {
  const coords = trip.waypoints.map((p) => p.join(",")).join(";")
  const url = `${OSRM}/${coords}?overview=full&geometries=geojson`
  const data = await getJson(url)
  if (data.code !== "Ok") throw new Error(`OSRM ${trip.id}: ${data.code}`)
  await sleep(1100)

  const full = data.routes[0].geometry.coordinates
  const project = projector(full[Math.floor(full.length / 2)][1])
  const trimmed = trim(full, trip.trimStart, trip.trimEnd, project)
  const line = simplify(trimmed, SIMPLIFY_M, project).map(([lng, lat]) => [
    round5(lng),
    round5(lat),
  ])

  const places = []
  for (const name of trip.places) {
    const point = await geocode(name)
    const { along, offset } = alongM(line, point, project)
    if (offset > PLACE_MAX_OFFSET_M) {
      console.warn(
        `  skip ${name}: ${Math.round(offset / 1000)} km off ${trip.id}`
      )
      continue
    }
    places.push({ name, km: Math.round(along / 100) / 10 })
  }
  places.sort((a, b) => a.km - b.km)

  const km = lengthM(line, project) / 1000
  console.log(
    `${trip.id}: ${full.length} -> ${line.length} points, ${km.toFixed(1)} km,`,
    places.map((p) => `${p.name}@${p.km}`).join(" ")
  )
  features.push({
    type: "Feature",
    properties: {
      id: trip.id,
      name: trip.name,
      highway: trip.highway,
      from: trip.from,
      to: trip.to,
      places,
    },
    geometry: { type: "LineString", coordinates: line },
  })
}

const collection = {
  type: "FeatureCollection",
  attribution:
    "Route lines © OpenStreetMap contributors (ODbL), routed with OSRM; place positions from Nominatim",
  generated: new Date().toISOString().slice(0, 10),
  features,
}
writeFileSync(OUT, JSON.stringify(collection) + "\n")
console.log(`Wrote ${path.relative(process.cwd(), OUT)}`)
