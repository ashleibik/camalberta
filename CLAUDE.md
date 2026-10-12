# CamYYC: notes for Claude

Full stack Next.js app showing traffic and road cameras for Calgary, the
Banff / Bow Valley corridor and Edmonton on a map with live snapshots (and live
video where the operator publishes it). School project, MIT.

## Read first

- **Next.js 16.4 is newer than your training data.** Before writing Next.js
  code, read the relevant guide in `node_modules/next/dist/docs/`. Notable:
  `cacheComponents` and `partialPrefetching` are on (data is dynamic by
  default, opt in to caching with `"use cache"`), middleware is now `proxy.ts`,
  route types come from `next typegen` (`LayoutProps<"/">`, etc.).
- Work in phases (below). Commit at the end of each phase as
  `Phase N complete`. In interactive mode, stop after each phase and wait for
  an OK.
- Before writing a source adapter, fetch the real API response, save it as a
  test fixture, and build Zod schemas from it. Never assume field names.

## Commands

```bash
npm run dev           # dev server on :3000
npm run build         # production build
npm run check         # lint + typecheck + format check (run before commits)
npm run lint          # eslint .
npm run typecheck     # next typegen && tsc --noEmit
npm run format        # prettier --write .
npm run db:generate   # drizzle-kit generate (SQL migrations into ./drizzle)
npm run db:migrate    # drizzle-kit migrate (PGlite or DATABASE_URL)
npm audit --omit=dev  # must be clean of high/critical
```

## Layout

```
src/app/                 routes (App Router). API routes go in src/app/api/
src/components/ui/       shadcn components (generated, edit sparingly)
src/components/shell/    app shell: sidebar, map area, detail panel, status bar
src/lib/env.ts           Zod-validated env vars (server-only)
src/lib/db/              Drizzle client (getDb) and schema
src/lib/sources/         one adapter per camera source + areas, __fixtures__
                         (calgary, alberta511, banff, sunshine, edmonton)
src/lib/media.ts         which sources are photos vs live video; sourceFromId
src/lib/sync.ts          runSync: run adapters, upsert, mark missing offline
src/lib/cameras.ts       getCameraById, setCameraStatus
src/lib/auth.ts          timing-safe CRON_SECRET check
src/lib/rate-limit.ts    in-memory per-IP limiter + enforceRateLimit helper
src/lib/proxy/           image fetch/cache + SVG placeholder; hls.ts = live
                         video relay (playlist rewrite + segment cache)
src/lib/api-types.ts     shared response types (PublicCamera, CamerasGeoJSON, ...)
src/lib/serialize.ts     DB row -> PublicCamera / GeoJSON feature (drops imageUrl)
src/lib/queries.ts       getCamerasGeoJSON (use cache, 5 min), getHealth
src/lib/camera-id.ts     shared Zod schema for our camera ids
src/app/api/sync/        protected sync route (Vercel Cron target)
src/app/api/cam/[id]/image/  image proxy (photo sources)
src/app/api/cam/[id]/live/   live video: playlist, and live/[segment] for .ts
src/app/api/cameras/     GET list (GeoJSON) and GET [id] (details)
src/app/api/health/      counts per source + last sync time
src/components/providers.tsx   TanStack Query client + global error toast
src/components/app/      interactive shell: app-state, filters, camera-list,
                         sidebar-content, detail-content, command-palette,
                         status-bar, app-shell
src/lib/client/          client data: api fetchers, query hooks, favorites,
                         use-media-query, use-now, use-clock (shared 1s
                         ticker), wall, types, refresh (refresh-request bus)
src/lib/format.ts        labels + timeAgo + coordinate formatting
src/components/app/map/  MapLibre: index (lazy wrapper), map-view, geo helpers
src/components/app/live-snapshot.tsx  self-refreshing camera snapshot
src/components/app/live-video.tsx     live HLS player (hls.js light, lazy)
src/components/app/camera-media.tsx   picks LiveSnapshot or LiveVideo by id
src/components/app/live-badge.tsx     shared "LIVE" pill + formatAge
src/types/               ambient module types (hls.js/light)
src/components/app/wall/ camera wall: wall-client, wall-tile, add-camera-dialog
src/lib/client/wall.ts   wall config: localStorage + URL parse/serialize (Zod)
src/app/wall/page.tsx    /wall route (lazy, client-only)
scripts/copy-maplibre-worker.mjs  copies MapLibre's worker into public/vendor
scripts/migrate.mjs      db:migrate runner (Postgres or PGlite)
drizzle/                 generated SQL migrations
ml/                      Python road condition model (Phase 10)
.data/                   local PGlite database (gitignored)
```

## Conventions

- TypeScript strict plus `noUncheckedIndexedAccess`. No `any` (ESLint error);
  if one is truly needed, disable the rule on that line with a reason.
- Prettier: no semicolons, double quotes, trailing commas `es5`, Tailwind class
  sorting. Matches shadcn's generated code.
- Import `cn` from `@/lib/utils`.
- Server-only modules start with `import "server-only"` (env, db, sources).
- Database: always go through `getDb()` (lazy singleton cached on
  `globalThis`). It uses Postgres when `DATABASE_URL` is set and PGlite at
  `PGLITE_DATA_DIR` otherwise. Never open a second PGlite on the same dir.
- Validate with Zod: env vars, every route param, query and body (400 on bad
  input), and all upstream data before it touches the DB.
- Theme: zinc base, dark default (`next-themes`, class strategy, system theme
  off). Colour tokens in `globals.css`: `status-live` / `status-stale` /
  `status-offline`, and `road-dry` / `road-wet` / `road-partly-snow` /
  `road-snow-covered` / `road-cant-see` (use as `bg-status-live`, etc.).
- Fonts: Geist (`font-sans`) for UI, Geist Mono (`font-mono`) for coordinates,
  timestamps and IDs.
- Motion: 150 to 200ms transitions. A global `prefers-reduced-motion` rule in
  `globals.css` disables animations.
- Attribution text in the footer and README must stay exactly: "Data: City of
  Calgary (Open Government Licence) and 511 Alberta". The other camera owners
  (Town of Banff, Banff Sunshine Village, City of Edmonton) are credited after
  it, and every camera's detail panel shows "Photos/Video © owner" with a link
  (`SOURCE_CREDITS` in `src/lib/format.ts`). Edmonton's terms require the
  copyright notice.

## Security

- Headers live in `next.config.ts` (`headers()`): CSP, HSTS,
  `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`
  (camera, mic, geolocation off), COOP.
- CSP allows only our origin plus `https://tiles.openfreemap.org`, with
  `blob:` workers for MapLibre and hls.js, and `media-src 'self' blob:` for
  live video (Media Source Extensions). **Tradeoff:** `script-src` includes
  `'unsafe-inline'` because Next.js injects inline bootstrap scripts, and
  nonce-based CSP requires fully dynamic rendering, which conflicts with
  `cacheComponents` / PPR. The mitigation is that we never render untrusted
  HTML (enforced by lint). `'unsafe-eval'` is dev-only.
- ESLint errors on `dangerouslySetInnerHTML`, `innerHTML` / `outerHTML`
  assignment, `insertAdjacentHTML`, `eval`, `new Function` and `any`.
- `CRON_SECRET` is optional in the env schema. If it's unset, protected routes
  must reject everything (fail closed). Compare with `crypto.timingSafeEqual`.
- The browser never calls upstream APIs or camera hosts. Everything goes
  through our backend, and the image proxy looks cameras up by our own ID only.
- Errors returned to clients carry no stack traces or upstream URLs.

### Dependency policy

- Don't install a package version published less than 7 days ago (supply
  chain caution). Pin the previous release instead.
- `npm audit --omit=dev` must be clean. Accepted dev-only findings:
  - `braces` (GHSA-vfj7-8cjw-p6xm, high): no patched version exists. It's
    reached through `eslint-config-next`, `shadcn` CLI and `fast-glob`, and only
    exploitable with attacker-controlled glob patterns. npm's "fix" downgrades
    eslint-config-next to v14.
  - `esbuild` (GHSA-67mh-4wv8-2f99, moderate) inside `drizzle-kit`: affects
    esbuild's dev server, which drizzle-kit does not run.
- `shadcn` is a devDependency. Only its `tailwind.css` is imported, and that
  happens at build time.

## Decisions log

- 2026-10-11: Project lives at `C:\Users\shlei\camyyc`.
- 2026-10-11: shadcn/ui on Radix (`radix-nova` style: Lucide + Geist). Palette
  switched from neutral to zinc, radius 0.75rem. shadcn now ships `cn` as its
  own package (`cn`, by shadcn) instead of clsx + tailwind-merge.
- 2026-10-11: Kept create-next-app defaults `cacheComponents` and
  `partialPrefetching` (both become always-on in the next major).
- 2026-10-11: Postgres driver for production is `postgres` (postgres.js) with
  `prepare: false`, so it works behind Neon and Supabase poolers.
- 2026-10-11: "Private" cameras means privately run cameras whose owners
  publish them openly (or give us permission). Never cameras that are merely
  reachable (unsecured IP cams, scanner indexes). This includes institutional
  surveillance such as MRU campus security cameras: publicly funded is not the
  same as published for public viewing, so we don't include them. Building
  outlines (MRU, residential, commercial) from open map data are fine as
  geometry; private cameras on them are not.
- 2026-10-11 (Phase 1): 511 Alberta now requires a developer key (`key` query
  param) that the brief predates. The adapter is built to the documented schema
  (`help/endpoint/cameras`) and tested against a fixture of that shape, not a
  live pull. It is skipped (not failed) when `ALBERTA_511_API_KEY` is unset, so
  a Calgary-only sync still succeeds. The 511 view `Url`
  (`https://511.alberta.ca/map/Cctv/<id>`) is a direct public image.
- 2026-10-11 (Phase 1): one normalized camera per _enabled_ 511 view
  (`sourceId = <cameraId>-<viewId>`), since a physical camera can expose
  several directional images. Calgary `sourceId` is the `locNN` from the image
  URL.
- 2026-10-11 (Phase 1): adapters validate upstream with Zod and reject any
  image host other than the known one (`trafficcam.calgary.ca`,
  `511.alberta.ca`) as defense in depth.
- 2026-10-11 (Phase 1): sync marks a source's missing cameras offline only when
  that source returned at least one camera, so a transient empty-but-200
  upstream response never knocks a whole source offline.
- 2026-10-11 (Phase 1): `db:migrate` runs `scripts/migrate.mjs` (not
  `drizzle-kit migrate`), because drizzle-kit's PGlite driver fails to create
  the data dir. The script loads `.env` via Node's `--env-file-if-exists`.
- 2026-10-11 (Phase 1): `/api/sync` can't use `export const dynamic`/`runtime`
  route segment configs — they're incompatible with `cacheComponents`. Route
  handlers are uncached and Node-only by default anyway.
- 2026-10-11 (Phase 2): image proxy at `/api/cam/[id]/image`. Validates the id
  format with Zod (`<source>:<sourceId>`, never a URL), looks the camera up by
  our own id, and re-checks the stored URL's host against a per-source
  allowlist (`SOURCE_IMAGE_HOSTS`) before fetching (SSRF defense in depth).
- 2026-10-11 (Phase 2): an in-memory single-flight cache (`getCameraImage`)
  means repeated/concurrent requests hit upstream at most once per camera per
  cache window (≤30s). This, not the per-IP limit, is the real protection for
  the upstreams. (Revised after Phase 6 — see "camera timing" below.)
- 2026-10-11 (Phase 2): only `image/jpeg`/`image/png` pass (jpg normalized to
  jpeg); 5s upstream timeout; min/max size guards. Any failure serves an SVG
  placeholder (`src/lib/proxy/placeholder.ts`) and marks the camera `stale`
  (the proxy also restores `stale`→`live` when a camera serves images again).
  Unknown id → 404, bad id format → 400. Verified live end to end.
- 2026-10-11 (Phase 2): route handler typed with the generated
  `RouteContext<"/api/cam/[id]/image">` global; `params` is a Promise in
  Next 16.
- 2026-10-11 (Phase 3): public API. `GET /api/cameras` returns compact GeoJSON
  (all cameras, both areas; the UI filters client-side). `GET /api/cameras/[id]`
  returns full details. `GET /api/health` returns per-source counts and the
  last sync time (max lastSeenAt). All rate limited (api bucket) and Zod
  validated. Response shapes live in `src/lib/api-types.ts` for end-to-end
  types; serializers in `src/lib/serialize.ts` always drop `imageUrl`.
- 2026-10-11 (Phase 4): UI shell. TanStack Query (`Providers`) with a global
  `QueryCache.onError` that fires a sonner toast. Filters + selection live in a
  client context (`app-state`); selection mirrors to `?cam=` via
  `history.replaceState`. Filtering is client-side (`use-visible-cameras`), so
  changing a filter never refetches. Favorites are in `localStorage` via a
  `useSyncExternalStore` store, every access try/catch wrapped.
- 2026-10-11 (Phase 4): `Date.now()` during render trips cacheComponents'
  static-shell check, so relative times come from a `useNow()` hook that stays
  null until after mount (see `src/lib/client/use-now.ts`).
- 2026-10-11 (Phase 4): the camera list uses a native `overflow-y-auto`
  container, not shadcn `ScrollArea` — Radix ScrollArea's viewport sizes to
  content width, which breaks `truncate` on long camera names.
- 2026-10-11 (Phase 4): this shadcn `CommandDialog` does NOT include the cmdk
  `<Command>` root; callers must wrap their `CommandInput`/`CommandList` in
  `<Command>` or cmdk throws "reading 'subscribe'".
- 2026-10-11 (Phase 4): mobile uses bottom `Sheet`s for the sidebar and the
  detail panel (shown below the xl breakpoint, gated by `useMediaQuery`). The
  map stays a placeholder until Phase 5.
- 2026-10-11 (Phase 5): MapLibre GL JS 6.12.0 with OpenFreeMap styles
  (`dark` in dark mode, `positron` in light) — all glyphs/sprites/tiles are on
  `tiles.openfreemap.org`, already the only third-party host the CSP allows.
  Loaded lazily via `next/dynamic({ ssr:false })` to keep it out of the initial
  bundle.
- 2026-10-11 (Phase 5): **MapLibre's worker must be self-hosted.** It loads via
  `new URL('./maplibre-gl-worker.mjs', import.meta.url)`, which Turbopack dev
  does not serve, so the map silently never finishes loading. `predev`/`prebuild`
  run `scripts/copy-maplibre-worker.mjs` to copy the worker (and the
  `maplibre-gl-shared.mjs` it imports) into `public/vendor/maplibre/`, and
  map-view calls `maplibregl.setWorkerUrl('/vendor/maplibre/maplibre-gl-worker.mjs')`.
  `public/vendor/` is gitignored and excluded from lint/prettier.
- 2026-10-11 (Phase 5): one clustered GeoJSON source; layers for clusters,
  cluster-count, unclustered points (circle-color `match` on status =
  live/stale/offline), and a selected-ring. Filters update instantly via
  `source.setData(camerasToGeoJSON(visible))` — no refetch. Click a marker →
  `setSelectedId` (→ `?cam`); click a cluster → zoom in; hover → a `setText`
  popup (never HTML). All animations honor `prefers-reduced-motion`.
- 2026-10-11 (Phase 5): headless software WebGL captures the map canvas as
  black (preserveDrawingBuffer is false); verify the map functionally via the
  MapLibre API over CDP, not by screenshot pixels.
- 2026-10-11 (Phase 6): `LiveSnapshot` makes snapshots live. It `fetch`es the
  photo (so it can read the timing headers below), decodes it off-screen and
  swaps an object URL in only when the photo is genuinely newer (no blank
  flash, no pointless swaps), shows the photo's age ("LIVE 23s ago") and, in the
  detail panel, "Still photos, not video: a new one about every 60s · next in
  ~Ns". It pauses on `visibilitychange` when the tab is hidden. A shared
  1-second `useClock()` drives every age label (one timer for the whole wall).
- 2026-10-12 (Phase 6 fix, **camera timing**): users saw "nobody moving". These
  are still photos, not video. Measured: Calgary captures one photo per camera
  per 60s (Last-Modified e.g. hh:mm:09) but **publishes it 25-45s later**, and
  the phase/delay differs per camera. 214/215 cameras were current; `loc49` was
  frozen upstream (~31h old) yet shown as live. Fixed by:
  - The proxy (`src/lib/proxy/image.ts`) learns each camera's rhythm: interval
    = smallest recent gap between Last-Modified stamps, publication delay =
    when a new photo first appears while checking closely (≤15s), nudged 1s
    earlier after each on-time catch. Gaps only count while someone is watching
    (previous check ≤150s ago) — an idle stretch once taught it "every 10 min".
    The cache expires when the next photo should be available (≤30s, the
    brief's cap); late photos are re-checked every 5s, long-overdue (frozen)
    cameras back off to 30s.
  - The route sends `Last-Modified`, `X-Next-Snapshot` and
    `X-Snapshot-Interval`, and `Cache-Control: public, max-age=0,
s-maxage=<until next photo>, stale-while-revalidate=5` (was a fixed
    `s-maxage=30, stale-while-revalidate=60`, which let CDNs serve old frames).
  - A photo older than 10 min (`STALE_PHOTO_MS`) marks the camera `stale` and
    the badge reads "Old photo".
  - Measured result: new photos on screen 3-6s after Calgary publishes them,
    one request per photo in steady state (was up to ~50s late, 2 req/min, half
    of them returning the same frame).
  - Upstream occasionally returns an older photo than one already seen; the
    timestamp never moves backwards and the client only swaps newer photos.
- 2026-10-12 (owner request, between Phases 6 and 7): **more sources, live
  video, refresh button.** Researched what each operator actually publishes:
  - Calgary: still JPEGs only ("up-to-the-minute images"; footage not
    recorded). 511 Alberta's API: one image `Url` per view, no video field.
  - **Town of Banff** (`banff` source): 17 street cameras published as plain
    JPEGs on banff.ca/trafficcams, no feed or coordinates. Curated list in
    `sources/banff.ts`; positions from OpenStreetMap intersections and
    landmarks (approximate; two-way poles nudged ~8m apart). Updates every
    1-3 min; some are frozen at the source (e.g. `rimrock-south`, 11 days) and
    correctly show "Old photo".
  - **Banff Sunshine Village** (`sunshine`): 4 resort webcams
    (cameras.skibanff.com/dynamic/<n>m, JPEG, new photo every minute).
    Positions = lift top stations in OSM; the Assiniboine camera's mount isn't
    published (placed at the Great Divide top, approximate). Site says "All
    Rights Reserved": shown with credit + link; permission is a TODO before
    any public launch.
  - **City of Edmonton** (`edmonton`, new area `edmonton`): 58 cameras with
    **real live video** (HLS) from the camera list edmontontrafficcam.com
    loads (`Default.aspx/GetCameras`). Conditions of use allow personal,
    educational, non-commercial use with the copyright notice. Their CDN only
    sends CORS headers for the City's own site, so browsers can't play it
    directly; we relay it server-side (never re-encode, never record), which
    also matches our "browser never calls upstream" rule.
- 2026-10-12: **Live video relay** (`src/lib/proxy/hls.ts`). Our playlist is
  rebuilt from parsed values (never passed through): segments must be
  `<streamCode><n>.ts` next to the playlist, and master/encryption/fMP4/LL-HLS
  tags reject the whole playlist. Segments are addressed by media sequence
  number (`/live/<seq>.ts`) because upstream reuses a ring of 5 file names.
  **Measured:** upstream starts writing the next segment over the _oldest_
  file before its playlist moves on, so we drop the oldest entry entirely
  (`withoutOldest`) — players requesting it caused startup 404s. Upstream
  playlist fetched ≤1/s per camera (single-flight), newest 3 segments
  prefetched (`after()`), segments cached 30s, max 300 cached, MPEG-TS sync
  bytes checked, `redirect: "error"`. Upstream load per watched camera ≈ one
  viewer, however many people watch. Rate limit bucket `video` (2,400/min per
  IP; a 16-tile wall needs ~960). Measured: 140+ segments, 0 failures; video
  ~0.6 Mbit/s (800×450).
- 2026-10-12: Player = hls.js **1.7.3** (published 2026-09-11) light build,
  dynamically imported only when a video camera is shown (Safari uses native
  HLS). `src/types/hls-light.d.ts` re-exports the full build's types.
  `liveSyncDurationCount: 2`, `liveMaxLatencyDurationCount: 4`. Downloads stop
  while the tab is hidden; it rejoins at the live edge on return.
- 2026-10-12: **Refresh button.** Photos: `?refresh=1&r=<nonce>` makes the
  proxy re-check upstream now (`getCameraImage(..., { force: true })`), but a
  check younger than 3s is reused, so button mashing can't hammer a source.
  The badge then says "New photo" / "Already the newest photo". Video:
  reconnects at the live edge. Wall tiles get a refresh control and the wall
  header "Refresh all" (a tiny event bus, `src/lib/client/refresh.ts`).
- 2026-10-12: The desktop detail panel is CSS-hidden below xl but stays
  mounted; it now gets `mediaActive={isWideDetail}` so phones don't stream a
  second, invisible copy of the video (and no longer double-fetch photos).
- 2026-10-12: Map: "Fly to" buttons for Calgary / Banff / Edmonton, and
  picking an area in the filters flies there (Edmonton is ~300 km away).
- 2026-10-11 (Phase 6): `/wall` is a client-only route (`dynamic ssr:false`) so
  it reads its config from the URL synchronously. Config (`grid` 1-4, `cams`,
  order) lives in the URL — validated with Zod on read (`src/lib/client/wall.ts`)
  — and is mirrored to `localStorage` so a bare `/wall` restores the last wall.
  Tiles reorder with native HTML5 drag-and-drop; "Add to wall" (detail panel)
  appends to the stored wall.
- 2026-10-11 (Phase 3): `/api/cameras` is cached 5 min via `use cache` +
  `cacheLife({ stale: 300, revalidate: 300, expire: 3600 })` + `cacheTag`, plus
  a matching `Cache-Control`. The sync route calls
  `revalidateTag(CAMERAS_CACHE_TAG, { expire: 0 })` so new data shows
  immediately. Next 16.4 `revalidateTag` needs the 2-arg form.

## Decisions made while autonomous

_None yet._

## Phases

- [x] 0 Setup
- [x] 1 Data layer
- [x] 2 Image proxy
- [x] 3 API
- [x] 4 UI shell
- [x] 5 Map
- [x] 6 Camera viewer and wall
- [ ] 7 Security review
- [ ] 8 Performance and polish
- [ ] 9 Road condition data collection
- [ ] 10 Road condition model
- [ ] 11 Ship it
