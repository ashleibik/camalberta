# CamYYC: notes for Claude

Full stack Next.js app showing traffic and road cameras for Calgary and the
Banff / Bow Valley corridor on a map with live snapshots. School project, MIT.

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
src/lib/sync.ts          runSync: run adapters, upsert, mark missing offline
src/lib/cameras.ts       getCameraById, setCameraStatus
src/lib/auth.ts          timing-safe CRON_SECRET check
src/lib/rate-limit.ts    in-memory per-IP limiter + enforceRateLimit helper
src/lib/proxy/           image fetch/cache + SVG placeholder
src/lib/api-types.ts     shared response types (PublicCamera, CamerasGeoJSON, ...)
src/lib/serialize.ts     DB row -> PublicCamera / GeoJSON feature (drops imageUrl)
src/lib/queries.ts       getCamerasGeoJSON (use cache, 5 min), getHealth
src/lib/camera-id.ts     shared Zod schema for our camera ids
src/app/api/sync/        protected sync route (Vercel Cron target)
src/app/api/cam/[id]/image/  image proxy
src/app/api/cameras/     GET list (GeoJSON) and GET [id] (details)
src/app/api/health/      counts per source + last sync time
src/components/providers.tsx   TanStack Query client + global error toast
src/components/app/      interactive shell: app-state, filters, camera-list,
                         sidebar-content, detail-content, command-palette,
                         status-bar, app-shell
src/lib/client/          client data: api fetchers, query hooks, favorites,
                         use-media-query, use-now, types
src/lib/format.ts        labels + timeAgo + coordinate formatting
src/components/app/map/  MapLibre: index (lazy wrapper), map-view, geo helpers
src/components/app/live-snapshot.tsx  self-refreshing camera snapshot
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
  Calgary (Open Government Licence) and 511 Alberta".

## Security

- Headers live in `next.config.ts` (`headers()`): CSP, HSTS,
  `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`
  (camera, mic, geolocation off), COOP.
- CSP allows only our origin plus `https://tiles.openfreemap.org`, with
  `blob:` workers for MapLibre. **Tradeoff:** `script-src` includes
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
- 2026-10-11 (Phase 2): a 30s in-memory single-flight cache
  (`getCameraImage`) means repeated/concurrent requests hit upstream at most
  once per camera per 30s. This, not the per-IP limit, is the real protection
  for the rate-limited upstreams. Response cache is
  `public, s-maxage=30, stale-while-revalidate=60`.
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
- 2026-10-11 (Phase 6): `LiveSnapshot` makes snapshots live. It refreshes every
  30s on the shared `?t=floor(now/30s)` bucket, preloads the next frame in an
  off-screen `Image` and only swaps `src` once it has loaded (no blank flash),
  and pauses on `visibilitychange` when the tab is hidden (resuming with an
  immediate refresh). Used by the detail panel and every wall tile.
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
