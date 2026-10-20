# CamAlberta

**Should I drive today?** Trip Check answers that in a few seconds for four
trips from Calgary: **Canmore, Banff and Lake Louise** on Highway 1, and
**Edmonton** on Highway 2 (QEII), using 511 Alberta's road conditions,
closures, construction and weather stations, plus the cameras along the way.

Behind it is a fast live map of every public traffic and road camera in
**Calgary**, the **Banff / Bow Valley corridor** (Canmore, Banff, Sunshine
Village, Lake Louise), along the **QEII** and in **Edmonton**. Photos refresh
on their own the moment a camera publishes a new one; Edmonton's cameras are
**real live video**. Later phases add an experimental AI estimate of road
conditions (dry, wet, snow) on the mountain highways.

> Status: in development (phases 0 to 9 and 6B done). Built as a school
> project.

## Features

- **Trip Check** (the homepage, `/trip?to=banff`): a green, yellow or red
  verdict with the exact reasons ("Bridge maintenance near Lacombe"), the
  cameras along the route in driving order, a route map, road conditions per
  stretch with temperature and wind, and closures, incidents and
  construction. Optional browser alerts when a trip gets worse.
- **Camera map** (`/map`): clustered markers, filters (area, source, status,
  favorites), search (Ctrl/Cmd + K), and a detail panel with the live view.
- **Camera wall** (`/wall`): up to 16 live cameras in a grid, saved in the URL.

## Trip Check

**Routes.** Each trip is a simplified line built from OpenStreetMap data
(`scripts/build-trip-routes.mjs`, stored in `src/lib/trip/routes.json`). It
starts where the highway crosses Calgary's ring road (Stoney Trail), so
"km 40" means 40 km from the city's edge, and ends in town (or at Edmonton's
Anthony Henday Drive).

**Matching.** Something belongs to a trip when it's close to the line:
cameras and events within 500 m, weather stations within 2 km, and road
condition segments when at least 40% of their length lies within 150 m.
That tighter rule keeps Highway 2A and crossing roads out of the QEII's
verdict. Cameras are sorted by distance along the route.

**Verdict.** Simple rules, all in one commented file
([src/lib/trip/config.ts](src/lib/trip/config.ts)):

| Verdict                        | When                                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Red**: "Check before you go" | A closure or major event on the route, or a condition of Closed or Travel Not Recommended                        |
| **Yellow**: "Drive carefully"  | Snow, ice, partly covered, frost, fog or poor visibility, strong wind, no report, or construction or an incident |
| **Green**: "Looks good"        | None of the above                                                                                                |
| **Grey**: "Can't confirm"      | Our data is over 30 minutes old (or missing), so we won't say it looks good                                      |

Every yellow or red comes with its reasons. If the data is more than 30
minutes old the page says "Data may be out of date" and never shows green.
A value 511 sends that no rule recognizes counts as yellow, never green, and
the sync logs it. Under the verdict the page shows its source: "Data from official 511 Alberta,
refreshed every 15 minutes."

**Data flow.** 511 allows 10 calls per 60 seconds. The scheduled sync makes 4
(cameras, road conditions, events, weather stations), stores only what lies
near the routes, and refuses to call 511 again within a minute. Pages read
only from our database.

**Alerts.** "Notify me if this trip gets worse" uses the Web Push API (no
account, no email). We store only the browser's push subscription and the
chosen trip, plus the verdict last sent and when (for "only when worse, at
most once an hour"). Turning alerts off deletes the row; so does a push
service reporting the subscription gone.

## Road condition data

Training data for the road condition model (Phase 10).

**What's saved.** Every 15 minutes, one photo from each Bow Valley road
camera: 511 Alberta's highway cameras and the Town of Banff's street cameras
(37 in October 2026). Sunshine Village's ski-hill cameras are left out. Each
photo is saved with:

- the 511 road condition for the road in view (nearest segment within 300 m)
- the nearest road weather station's reading (within 30 km)
- an automatic label

The collector only reads the 511 data the sync already stored, so it makes no
511 calls of its own.

**Frozen feeds.** Some cameras get stuck on one photo. The collector skips a
photo that is identical to the camera's last saved one (same SHA-256). It
also skips any photo more than 30 minutes old. So a stuck camera neither
fills storage nor gets labelled with weather it never saw.

**Labels.** There are five: `dry`, `wet`, `partly_snow`, `snow_covered` and
`cant_see`. The automatic label comes from 511's condition:

- Bare Dry → dry, Bare Wet → wet.
- Partly Covered → partly snow.
- Covered or Packed → snow covered. Ice counts as snow, because a photo
  doesn't reliably show it.
- "Bare Wheel Paths" turns a bare road into partly snow.
- Poor visibility, or a photo too dark or washed out to judge → can't see.
- Closed and No Report get no automatic label.

The rules are in [src/lib/collect/labels.ts](src/lib/collect/labels.ts).

**Review.** On `/admin/label`, each photo appears next to 511's condition,
the weather and the automatic label. A reviewer confirms or corrects it
(keys 1 to 5, 0 for "none fits"), and the human label wins. Sign in with any
user name and `CRON_SECRET` as the password.

**Where it runs.**

- Vercel's free plan runs cron jobs at most once a day.
- A free Cloudflare Worker cron gets 10 ms of CPU, too little to resize
  photos.

So a GitHub Actions schedule
([.github/workflows/collect.yml](.github/workflows/collect.yml), free on
public repositories) runs `npm run collect` every 15 minutes. Each run first
calls the app's `/api/sync`, so Trip Check's 511 data stays fresh too.

**Storage.** Photos are resized to 512 px wide JPEGs: about 20 KB each,
against 176 KB for the original. In production they go to Cloudflare R2; in
development, to `.data/snapshots`. Everything else goes in the `snapshots`
table. Estimate for 37 cameras:

|                 | Per run   | Per day | Per month           |
| --------------- | --------- | ------- | ------------------- |
| Photos (R2)     | ≤ 0.74 MB | ≤ 71 MB | ≤ 2.1 GB            |
| R2 writes       | ≤ 37      | ≤ 3,552 | ≤ 107,000 (Class A) |
| Rows (Postgres) | ≤ 37      | ≤ 3,552 | ≤ 107,000 (~45 MB)  |

These are ceilings. Frozen and stale cameras are skipped (6 of 37 on the
first run), so real use is nearer 1.8 GB a month.

R2's free tier covers 10 GB-month of storage and 1 million writes a month,
and downloads are free. Storage builds up month by month, so it stays free
for about 5 months. After that it costs $0.015 per GB-month above 10 GB:
about $0.21 a month after a year. The database rows reach a free 0.5 GB
Postgres limit in about 10 months. Without the resize, the photos would be
about 19 GB a month.

## Local setup

Requires Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env   # then fill in what you need (see below)
npm run db:migrate     # create the database tables
npm run dev            # http://localhost:3000
```

With no `DATABASE_URL`, the app uses [PGlite](https://pglite.dev), an embedded
Postgres stored in `.data/pglite`. Set `DATABASE_URL` to use Neon, Supabase or
any other Postgres. Only one process may use a PGlite folder at a time: stop
the dev server before running anything else against it.

### Environment

| Variable                                                               | What it's for                                                                                                                                                                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CRON_SECRET`                                                          | Protects `/api/sync`, `/api/collect`, `/api/push/test` and the `/admin` pages (password for the admin login). 32+ random characters.                                                                 |
| `SNAPSHOT_DIR`                                                         | Where road condition snapshots are saved in development (default `.data/snapshots`).                                                                                                                 |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Production snapshot storage: a Cloudflare R2 bucket (any S3-compatible service works). All four or none; `S3_REGION` defaults to `auto`.                                                             |
| `ALBERTA_511_API_KEY`                                                  | 511 Alberta cameras and all Trip Check data. Free: create an account at [511.alberta.ca](https://511.alberta.ca), then request a key on the [developer page](https://511.alberta.ca/developers/doc). |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`               | Trip Check push alerts. Generate keys with `npx web-push generate-vapid-keys`; the subject is a `mailto:` or `https:` contact. Leave empty to turn alerts off.                                       |

### Loading data

`/api/sync` pulls cameras and Trip Check data from upstream. In production,
the GitHub Actions schedule calls it every 15 minutes, and a daily Vercel
Cron is a backstop. To fill the database locally, start the dev server and
trigger a sync once:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/sync
```

Then collect road condition snapshots once (saved to `.data/snapshots`) and
review them at http://localhost:3000/admin/label:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/collect
```

Locally, collection goes through the dev server because the dev server holds
the PGlite database. `npm run collect` is the standalone version the schedule
runs against Postgres.

Calgary, Town of Banff, Sunshine Village and Edmonton cameras load with no
extra setup. Provincial highway cameras and Trip Check need
`ALBERTA_511_API_KEY`; without it those are skipped.

### Trying an alert

Open `/trip?to=banff`, press "Notify me if this trip gets worse" and allow
notifications. Then send a test notification:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/push/test?trip=banff"
```

Web push needs `localhost` or https, and on iPhone and iPad the site must be
added to the Home Screen first.

### API

| Route                             | Returns                                                   |
| --------------------------------- | --------------------------------------------------------- |
| `GET /api/trips/[trip]`           | Trip Check report: verdict, reasons, cameras, conditions  |
| `GET /api/cameras`                | All cameras as GeoJSON (cached 5 min)                     |
| `GET /api/cameras/[id]`           | Full details for one camera                               |
| `GET /api/cam/[id]/image`         | Proxied live snapshot (jpeg/png, or a placeholder)        |
| `GET /api/cam/[id]/live`          | Live video playlist (HLS) for video cameras               |
| `GET /api/cam/[id]/live/[seq].ts` | One live video segment (MPEG-TS)                          |
| `GET /api/health`                 | Camera counts per source and last sync time               |
| `POST /api/push/subscribe`        | Turn on alerts for a trip (JSON body, same-origin only)   |
| `POST /api/push/unsubscribe`      | Turn off alerts for a trip, or all trips                  |
| `POST /api/push/test`             | Send a test alert (requires `CRON_SECRET`)                |
| `POST /api/sync`                  | Run a sync (requires `CRON_SECRET`)                       |
| `POST /api/collect`               | Collect road condition snapshots (requires `CRON_SECRET`) |
| `/admin/label`                    | Label review page (admin login)                           |
| `GET /admin/snapshots/[id]/image` | A stored snapshot (admin login)                           |

`[trip]` is `canmore`, `banff`, `lake-louise` or `edmonton`. Every route is
rate limited and validates its input with Zod. Image and stream URLs are never
exposed to the browser; the proxies look cameras up by our own id.

Two options on the image route:

- `?w=320` returns a 320 px wide JPEG thumbnail (about 7 KB). It's cached
  like the photo itself: one resize per new photo.
- `?refresh=1&r=<any number>` checks the camera for a new photo right now.
  If the last check was under 3 seconds ago, that result is reused.

### Scripts

| Command                | What it does                                              |
| ---------------------- | --------------------------------------------------------- |
| `npm run dev`          | Start the dev server                                      |
| `npm run build`        | Production build                                          |
| `npm run check`        | Lint, typecheck, format check and unit tests              |
| `npm run test`         | Run unit tests (Vitest)                                   |
| `npm run test:e2e`     | Playwright smoke tests (reuses a dev server on :3000)     |
| `npm run format`       | Format everything with Prettier                           |
| `npm run db:generate`  | Generate SQL migrations from the schema                   |
| `npm run db:migrate`   | Apply migrations (Postgres or PGlite)                     |
| `npm run db:studio`    | Browse the database                                       |
| `npm run build:routes` | Rebuild the Trip Check route lines from OpenStreetMap     |
| `npm run collect`      | Collect snapshots once (Postgres; what the schedule runs) |
| `npm run lighthouse`   | Lighthouse on a production server (see below)             |

The first `npm run test:e2e` needs a browser: `npx playwright install chromium`.

## Performance and accessibility

Measured with Lighthouse 13.5 against a production build on a local server,
median of three runs (`npm run lighthouse`). "Lab" is Lighthouse's default
simulated mobile throttling; "applied" throttles the browser for real (4x CPU,
slow 4G).

| Page        | Mobile (lab) | Mobile (applied) | Desktop | Accessibility | Best practices | SEO |
| ----------- | ------------ | ---------------- | ------- | ------------- | -------------- | --- |
| Trip Check  | 90           | 93               | 100     | 100           | 100            | 100 |
| Camera wall | 94           | 98               | 100     | 100           | 100            | 100 |
| Camera map  | 69           | 77               | 98      | 100           | 100            | 100 |

- **Trip Check** renders its verdict on the server, streamed into the first
  response, so it shows before any JavaScript runs. The route map starts as a
  lightweight drawing; the interactive map (MapLibre, about 1 MB) loads when
  you ask for it. Its lab score varies about 86 to 95 between runs on a local
  server, because there every script finishes before the first paint and the
  simulation charges them all to the largest paint.
- **Camera map:** a full-screen WebGL map. Lighthouse runs Chrome with
  software rendering, where MapLibre's work (about 1.2 s of main-thread time
  on a throttled phone) lands on the CPU; a phone's GPU does much of it.
  We kept MapLibre (the brief's map engine) rather than hide the map behind a
  button on the page whose whole purpose is the map.
- Keyboard: every page starts with "Skip to content", focus is always
  visible, sheets return focus to what opened them, the trip picker is a radio
  group (arrow keys), and wall tiles can be reordered with buttons as well as
  by dragging. Playwright checks these paths, and that Trip Check doesn't
  shift while it loads.

To measure:

```bash
npm run build
PGLITE_DATA_DIR=.data/pglite-perf npm run db:migrate
PGLITE_DATA_DIR=.data/pglite-perf npx next start -p 3100
# in another terminal: sync once (as above, on port 3100), then
npm run lighthouse
```

Use a separate `PGLITE_DATA_DIR` while the dev server runs: two servers must
never share a PGlite folder.

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, MapLibre GL JS with
OpenFreeMap tiles, PostgreSQL with Drizzle ORM (PGlite in dev), TanStack Query,
Zod, Web Push (`web-push`), Vitest, Playwright. The road condition model
(later phases) lives in `/ml` and uses Python and PyTorch.

## Data sources

Data: City of Calgary (Open Government Licence) and 511 Alberta.

- **City of Calgary traffic cameras**:
  [dataset](https://data.calgary.ca/Transportation-Transit/Traffic-Cameras/k7p9-kppz),
  used under the
  [Open Calgary Terms of Use](https://data.calgary.ca/stories/s/Open-Calgary-Terms-of-Use/u45n-7awa).
- **511 Alberta**: provincial highway cameras, road conditions, events
  (closures, incidents, construction) and road weather stations, through the
  [511 Alberta API](https://511.alberta.ca/developers/doc). Condition wording
  follows 511's [definitions](https://511.alberta.ca/about/definitions).

Cameras also © their owners, credited in the app:

- **Town of Banff** street cameras,
  [banff.ca/trafficcams](https://banff.ca/trafficcams).
- **Banff Sunshine Village** webcams,
  [skibanff.com](https://www.skibanff.com/the-mountain/mountain-report/webcams).
- **City of Edmonton** live traffic video,
  [edmontontrafficcam.com](https://edmontontrafficcam.com/), used under the
  City's [Conditions of Use](https://www.edmonton.ca/conditionsofuse)
  (personal, educational, non-commercial).

**OpenStreetMap.** Trip Check route lines were routed with
[OSRM](https://project-osrm.org/) on OpenStreetMap data, and town positions
along them come from OpenStreetMap's [Nominatim](https://nominatim.org/).
Camera positions for Banff and Sunshine Village also come from OpenStreetMap,
since those owners don't publish coordinates. All © [OpenStreetMap
contributors](https://www.openstreetmap.org/copyright), available under the
Open Database Licence (ODbL).

**Areas covered.** Calgary, the Bow Valley (from Calgary's western edge to
Lake Louise) and Edmonton are bounding boxes; the QEII is a corridor along the
Calgary to Edmonton route. Both are defined in
[src/lib/sources/areas.ts](src/lib/sources/areas.ts).

The browser never calls these services directly. Our backend syncs on a
schedule, caches, and proxies images and live video, which respects upstream
rate limits: each camera is fetched once however many people watch it.

## Privacy

There are no accounts, no analytics and no tracking. Here is what the app
keeps.

- **Camera wall cookie.** The wall remembers your layout in a cookie, so the
  server can show your wall straight away:
  - **What it holds:** the grid size and camera ids, nothing else.
  - **Who gets it:** only `/wall` (`Path=/wall`). It's sent only over https
    (`Secure`), and other sites can't send it along (`SameSite=Lax`). It
    lasts a year.
  - **Size:** at most 2,048 characters. A full 16-camera wall is under
    1 KB. A larger wall is never written.
  - **Checking:** the server treats the cookie as untrusted. It validates
    the cookie with Zod (size and characters), then with the same strict
    schema as a wall URL: grid 1 to 4, at most 16 well-formed camera ids.
    Anything else is ignored.
- **Your browser's storage** (localStorage): favorite cameras and the last
  wall. These never leave your device.
- **Trip alerts:** if you turn them on, we store your browser's push
  subscription, the trip and the last verdict sent. Turning alerts off
  deletes them. We don't store an IP address, user agent or email.
- **Rate limiting:** counts requests per IP address, in memory, for a
  minute. Nothing is written to disk. The hosting platform keeps its own
  request logs.
- **Road condition snapshots:** photos from public traffic cameras, resized
  to 512 px, kept to train the road condition model. They only go to the
  admin label page. Nothing identifies people: no face or licence plate
  detection, and the model only looks at the road surface.

## Security

Security headers (CSP, HSTS and others) are set in `next.config.ts`. Every
input is validated with Zod (bad input gets a 400), every API route is rate
limited, and the camera proxies only serve cameras that are already in our
database. They fetch over https from each source's own host and never follow
a redirect anywhere else. Push alerts are only ever sent to the browsers' own
push services (Google, Mozilla, Apple, Microsoft), never to an address a
client makes up. CI runs lint, typecheck, unit tests, Playwright tests (including
security-header and input-validation checks) and the production `npm audit`
on every push, CodeQL scans the code, and Dependabot
keeps dependencies current.

The `/admin` pages (label review and stored snapshots) need a login: HTTP
Basic, with `CRON_SECRET` as the password. Without a secret configured they
refuse everyone. Each admin page, route and action checks again after the
proxy.

- Found a vulnerability? See [SECURITY.md](SECURITY.md) for how to report it
  privately.
- The Phase 7 review, with every check and fix:
  [SECURITY_REVIEW.md](SECURITY_REVIEW.md).

## License

[MIT](LICENSE)
