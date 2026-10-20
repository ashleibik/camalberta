# CamAlberta: notes for Claude

Full stack Next.js app. The homepage is **Trip Check** (`/trip`): "should I
drive today?" for Calgary to Canmore, Banff, Lake Louise and Edmonton, from
511 Alberta data. Behind it, a live map (`/map`) of traffic and road cameras
for Calgary, the Banff / Bow Valley corridor, the QEII and Edmonton with live
snapshots (and live video where the operator publishes it). School project,
MIT.

## Read first

- **`PROMPT.md` is the project brief**: phases, Hard rules and Security
  rules. This file records how they were carried out.
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
npm run check         # lint + typecheck + format check + unit tests (before commits)
npm run test:e2e      # Playwright smoke tests (reuses a dev server on :3000)
npm run build:routes  # rebuild src/lib/trip/routes.json from OpenStreetMap
npm run lighthouse    # Lighthouse x3 per page/form factor on a prod server :3100
npm run collect       # one snapshot collection, standalone (needs DATABASE_URL;
                      # locally use POST /api/collect, the dev server owns PGlite)
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
src/lib/auth.ts          timing-safe CRON_SECRET check (machine routes);
                         admin login (ADMIN_USERNAME/PASSWORD) + isAdminEnabled
src/lib/admin/           gate.ts (proxy's admin login check + lockout),
                         lockout.ts (rules, IP/64 key, memory store),
                         lockout-db.ts (Postgres store, atomic upsert)
src/lib/rate-limit.ts    in-memory per-IP limiter + enforceRateLimit helper
src/lib/http.ts          parseQuery (strict Zod query validation) + noQuery;
                         parseJsonBody (same-origin, JSON, 4 KB cap, Zod)
src/lib/proxy/           image fetch/cache + SVG placeholder; hls.ts = live
                         video relay (playlist rewrite + segment cache);
                         upstream.ts = fetchUpstream + readBodyLimited (the
                         only way to fetch a camera URL)
src/lib/sources/feed.ts  fetchFeedJson (no redirects, size cap) + safe sync
                         errors (SyncSourceError, describeSyncError)
src/proxy.ts             Next proxy (ex-middleware): 400 for badly encoded
                         /api paths; rate limit + admin login for /admin
.github/                 dependabot.yml, workflows/ci.yml, workflows/codeql.yml,
                         workflows/collect.yml (every 15 min: /api/sync on the
                         app, then npm run collect)
src/lib/api-types.ts     shared response types (PublicCamera, CamerasGeoJSON, ...)
src/lib/serialize.ts     DB row -> PublicCamera / GeoJSON feature (drops imageUrl)
src/lib/queries.ts       getCamerasGeoJSON (use cache, 5 min), getHealth
src/lib/camera-id.ts     camera id pattern + isCameraId guard (browser-safe);
                         camera-id-schema.ts = the Zod schema (server routes)
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
src/app/trip/page.tsx    /trip: Trip Check. Static shell + a Suspense hole that
                         reads ?to= and streams the server-rendered verdict
                         (getCachedTripReport); "/" redirects here
src/app/map/page.tsx     /map: the camera map (was "/"; /?cam= redirects here)
src/app/manifest.ts      web app manifest (Home Screen; needed for iOS push)
src/lib/trip/            Trip Check core. trips.ts (ids + isTripId, client-safe;
                         trip-schema.ts = Zod schema, server), routes.json
                         (OSM GeoJSON) + routes.ts (validated, indexed), geo.ts
                         (polyline decode, simplify, locate on line), config.ts
                         (ALL rules: distances, stale time, 511 value -> level),
                         matching.ts, verdict.ts, report.ts (pure report
                         builder), filter.ts (what sync keeps), corridors.ts
                         (QEII area), store.ts + sync.ts (server-only DB + 511)
src/lib/sources/alberta511-trip.ts  511 road conditions, events, weather stations
src/lib/push/            Web Push: endpoints.ts (push service allowlist, SSRF
                         guard), schema.ts (bodies), policy.ts (when to alert),
                         send.ts + alerts.ts (server-only, web-push)
src/app/api/trips/[trip]/ GET Trip Check report
src/app/api/push/        key, subscribe, unsubscribe, test (CRON_SECRET)
src/components/app/trip/ Trip Check UI: trip-check, verdict-card, camera-strip,
                         trip-map (route-preview SVG first, trip-map-view =
                         MapLibre on demand), camera-sheet (lazy), road-report,
                         alert-button, levels
src/components/app/app-nav.tsx  Trip Check / Camera map switch
src/components/app/intent-link.tsx  Link that prefetches on hover/touch/focus
src/components/app/skip-link.tsx    "Skip to content" (targets #main)
src/components/app/command-palette.tsx  Ctrl/Cmd+K + lazy -dialog.tsx (cmdk)
src/lib/zod-config.ts    Zod jitless (CSP); imported by the only browser Zod
                         user, the wall config (src/lib/client/wall.ts)
src/lib/client/push.ts   browser push: service worker, subscribe, alert trips
public/sw.js             service worker: shows alerts only (no caching)
src/lib/collect/         Phase 9: labels.ts (511 condition -> label, pure),
                         nearest.ts (segment/station near a camera, pure),
                         scope.ts (which cameras), collect.ts (runCollection),
                         review.ts (label queue queries)
src/lib/storage/snapshots.ts  snapshot storage: local folder (dev) or S3/R2
                         (prod); keys only from snapshotKey (validated)
src/lib/images/resize.ts sharp: toJpeg (25 MP input cap) + meanBrightness
src/lib/proxy/thumbnail.ts  320 px thumbnails for the image route's ?w=320
src/app/api/collect/     protected collection route (dev; prod runs the script)
src/app/admin/           page.tsx (-> /admin/label), label/ (review page +
                         saveLabel server action), snapshots/[id]/image
                         (stored photo). 404 unless enabled; own login
src/app/robots.ts        robots.txt: disallow /admin and /api/; sitemap.ts
src/lib/site.ts          siteUrl (NEXT_PUBLIC_SITE_URL) + pageMetadata: every
                         page's OG/Twitter block (title, description, image)
src/app/opengraph-image.png, twitter-image.png, icon.svg, apple-icon.png,
favicon.ico, public/icon-*.png   made by scripts/build-icons.mjs
                         (npm run build:icons; outputs committed)
scripts/collect.ts       npm run collect (GitHub Actions runs it)
e2e/                     Playwright: trip, a11y (keyboard, layout shift),
                         security (headers, input validation, wall cookie),
                         admin (login, label + undo); helpers.ts replays a
                         saved real trip report
scripts/lighthouse.mjs   npm run lighthouse (pinned lighthouse@13.5.0 via npx)
scripts/copy-maplibre-worker.mjs  copies MapLibre's worker into public/vendor
scripts/migrate.mjs      db:migrate runner (Postgres or PGlite)
scripts/build-trip-routes.mjs  route lines from OSRM (OSM) + Nominatim places
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
  Keep logic pure where possible (trip/matching, verdict, report; push/policy)
  so Vitest can test it on fixtures without a database.
- Database: always go through `getDb()` (lazy singleton cached on
  `globalThis`). It uses Postgres when `DATABASE_URL` is set and PGlite at
  `PGLITE_DATA_DIR` otherwise. Never open a second PGlite on the same dir.
- Validate with Zod: env vars, every route param, query and body (400 on bad
  input), and all upstream data before it touches the DB. In the browser,
  keep Zod out of the bundle: URL params and localStorage are checked with
  plain guards (`isCameraId`, `isTripId`) that share their patterns with the
  server schemas (tests assert they agree). The one exception is the wall
  config, which the brief requires to be Zod-validated (`zod/mini`).
- Performance budget: anything heavy that a page doesn't need for its first
  view loads on demand (`next/dynamic` + mount on first use, preload on
  hover/focus): MapLibre on Trip Check, the camera sheet, the command
  palette, the add-camera dialog. Header links use `IntentLink` (no
  prefetch until hover/touch/focus). Tooltips are provided only by the map
  shell.
- Keyboard and focus: every page has `SkipLink` + a focusable `#main`; never
  `outline-none` without a `focus-visible:ring-*` replacement; sheets return
  focus to the element that opened them (patched in `ui/sheet.tsx`).
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

- Full review and evidence: `SECURITY_REVIEW.md` (Phase 7). Reporting:
  `SECURITY.md`.
- Headers live in `next.config.ts` (`headers()`): CSP, HSTS,
  `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`
  (camera, mic, geolocation off), COOP, and CORP `same-origin` (no hotlinking
  of our proxies).
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
  It is for machine routes only and is **not** an admin login.
- **Admin pages** (`/admin/*`): in production a plain 404 (rewrite to
  `/_admin-disabled`, a path that can never be a route; no extra headers)
  unless `ADMIN_ENABLED=true`. Never rewrite to `/_not-found`: it's a real
  prerendered route, and Vercel serves it with status 200; in dev on
  unless `false`; never without `ADMIN_USERNAME` + `ADMIN_PASSWORD`. Login is
  HTTP Basic, both parts compared with `timingSafeEqual` (always both). The
  proxy runs `checkAdminLogin`: no header -> 401 challenge (not a failure);
  locked -> 429 before checking credentials; wrong -> counted + logged (IP,
  count; never credentials), 5 in 15 min locks the IPv4 or IPv6 /64 for
  15 min; right -> record cleared. Lockouts live in Postgres in production
  (`admin_login_failures`, shared by instances), in memory with PGlite (the
  proxy must never open PGlite). Store errors -> 503 (fail closed). Every
  admin page, route and action re-checks enabled + login. Admin responses
  carry `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store`.
- **Env-dependent checks in a page must come after a request-time API.**
  Before it, the check runs during prerendering at build time and its result
  is baked in (an `ADMIN_ENABLED` check once turned /admin/label into a
  static 404). For a component that must only ever run for a real request
  (uncached DB reads, auth), start it with `await connection()`. `headers()`
  alone isn't enough: runtime prefetches (partialPrefetching) resolve
  headers, and the uncached reads after them then hit the clock (Drizzle),
  which Next logs as "unstable value Date.now() while prerendering".
- **Supabase Data API lockout:** every `public` table has RLS on with no
  policies, and `anon` / `authenticated` have no privileges (migration
  `0004_rls_lockdown`). The app connects as the tables' owner, which RLS
  doesn't apply to; never `FORCE ROW LEVEL SECURITY`. **A new table's
  migration must `ENABLE ROW LEVEL SECURITY`**: `src/lib/db/rls.test.ts`
  fails CI otherwise. The project uses no Supabase client; keep the Data API
  off.
- **Snapshot storage keys** come only from `snapshotKey` and are validated on
  every put/get (the local store also checks the resolved path). Never build
  a key or path from request input; admin routes look keys up by DB id.
- **sharp** only ever gets bytes that already passed `fetchCameraImage`
  (allowlisted host, 3 MB cap, JPEG/PNG), and `resize.ts` caps decoding at
  25 MP. Resize sizes are fixed constants, never from a query.
- The browser never calls upstream APIs or camera hosts. Everything goes
  through our backend, and the proxies look cameras up by our own ID only.
- **Every upstream camera request goes through `fetchUpstream`**
  (`src/lib/proxy/upstream.ts`): https only, the source's allowlisted host
  only, redirects followed by hand (max 3) and re-checked. Never call `fetch`
  on a camera URL directly. Read bodies with `readBodyLimited` (streaming
  size cap). Source feeds use `fetchFeedJson` (no redirects, 5 MB cap).
- **Every API route** calls `enforceRateLimit` first and `parseQuery` with a
  strict schema (`noQuery` when it takes none). Only the push subscribe and
  unsubscribe routes read a body, through `parseJsonBody`: same-origin only
  (`Sec-Fetch-Site` / `Origin` vs `Host`, 403), `application/json` only (415),
  4 KB streaming cap (413), strict Zod schema (400). Any future body-reading
  route must use it. **Validate the request before checking whether a
  feature is available** ("push configured?" -> 503): a bad request gets the
  same 403/415/400 whether or not the feature is on.
- **Push alerts go only to the browsers' push services.** A subscription
  endpoint is a client-supplied URL our server POSTs to, so it must pass
  `isAllowedPushEndpoint` (`src/lib/push/endpoints.ts`: https, no port or
  credentials, FCM / Mozilla / Apple / WNS hosts only) at subscribe time and
  again before every send (SSRF). Never log an endpoint (it's a capability
  URL). We store only endpoint, keys, trip, baseline verdict and last-sent
  time; no IP, user agent or email.
- **511 calls:** 10 per 60 s across every instance. `runSync` claims the
  shared window (`claimAlberta511Window`, an atomic upsert on `sync_state`)
  before the 4 calls (cameras + 3 Trip Check feeds); a sync within 60 s of
  another skips 511 entirely. Pages and the trip API read our DB only.
- Rate limits (per IP per minute): JSON routes and sync 60; push subscribe /
  unsubscribe 10; image proxy 30 per camera + 200 overall; video 120 per
  stream + 1,200 overall. The client
  IP comes from `X-Real-IP`, else the LAST `X-Forwarded-For` hop, never the
  first (client-controlled). This assumes a proxy that sets them (Vercel
  does). In development only, limits are scaled ×20: locally there's no
  proxy, so every tab shares one "unknown" bucket.
- Errors returned to clients carry no stack traces or upstream URLs. Sync
  failures return `describeSyncError` categories; logs carry name and message
  only (the 511 key travels in a query string, so never log request URLs).

### Dependency policy

- Don't install a package version published less than 7 days ago (supply
  chain caution). Pin the previous release instead.
- `npm audit --omit=dev` must be clean (CI enforces it at `--audit-level=high`).
  Dependabot (Mondays, 7-day cooldown) opens one grouped PR per ecosystem
  for all minor and patch updates and a separate PR per major update
  (CodeQL's init/analyze majors share one; `@types/node` majors are ignored:
  it follows our Node 22). GitHub Actions are pinned to full commit SHAs of
  releases at least 7 days old. Accepted dev-only finding:
  - `braces` (GHSA-vfj7-8cjw-p6xm, high): no patched version exists. It's
    reached through `eslint-config-next`, `shadcn` CLI and `fast-glob`, and only
    exploitable with attacker-controlled glob patterns. npm's "fix" downgrades
    eslint-config-next to v14.
- **npm overrides** (`package.json`): `@esbuild-kit/core-utils` -> `esbuild`
  0.25.12 (GHSA-67mh-4wv8-2f99 needs >= 0.25.0; it pinned ~0.18.20, and
  drizzle-kit still depends on it, though its built code never loads it).
  Remove the override once drizzle-kit drops `@esbuild-kit`.
- **CodeQL** `js/insufficient-password-hash` on `safeEqual` in `auth.ts` is
  a false positive (SHA-256 only equalizes lengths for `timingSafeEqual`;
  nothing is stored), dismissed in code scanning.
- `shadcn` is a devDependency. Only its `tailwind.css` is imported, and that
  happens at build time.

## Decisions log

- 2026-10-11: Project lives in `C:\Users\shlei\` (the local folder still
  has the pre-rename name; renaming it is optional, see `TODO.md`).
- 2026-10-19: **Renamed the project to CamAlberta** (it covers Calgary, the
  Bow Valley and Edmonton, not just Calgary). The package name, titles, docs,
  `localStorage` keys (`camalberta:favorites`, `camalberta:wall`, the
  `camalberta:refresh` event) and `globalThis` cache keys all changed. Nothing
  had been deployed, so old browser keys are not migrated. No env var or
  database table carried the name, so no migration was needed.
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
  bytes checked, fetched via `fetchUpstream` (Phase 7). Upstream load per
  watched camera ≈ one viewer, however many people watch. Rate limits revised
  in Phase 7 (see Security). Measured: 140+ segments, 0 failures; video
  ~0.6 Mbit/s (800×450).
- 2026-10-12 (Phase 7): **Security review** — full write-up in
  `SECURITY_REVIEW.md` (13 findings, all fixed; live probe 39/39 on a
  production build). Main fixes:
  - `fetchUpstream`: no auto-followed redirects (SSRF) and https only.
  - Streaming body caps (photos 3 MB, segments 2 MB, playlists 64 KB,
    feeds 5 MB).
  - Rate limiter: client IP from X-Real-IP or the last XFF hop (the first was
    spoofable); amortized sweep plus a 50k-key cap (a full scan per request
    took 52s for 60k keys); per-camera limits; `/api/sync` is now limited.
  - `parseQuery`: strict query validation everywhere.
  - `src/proxy.ts`: 400 for malformed percent-encoding (Next answered 500).
  - Sync errors are sanitized; CORP `same-origin` is on every response.
  - Added `SECURITY.md`, Dependabot (7-day cooldown), CodeQL and CI
    workflows.
  - Testing note: two servers must not share a PGlite dir, so the production
    probe ran with `PGLITE_DATA_DIR=.data/pglite-review` on port 3100. On
    Windows, stopping a background `npx next start` can leave its node child
    holding the port: find it with `netstat -ano` and stop that PID.
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

- 2026-10-19 (Phase 6B): **Trip Check.** Real 511 responses were fetched
  first (one call each, key now in `.env`) and saved as fixtures; schemas and
  rules come from them. Findings that differ from 511's docs:
  - Road Conditions is `/api/v3/get/winterroads`; keys contain spaces
    (`"Primary Condition"`, `"Secondary Conditions"`), `EncodedPolyline` is a
    list (one line per carriageway, sometimes a loop of both directions).
  - Weather readings are strings and are **Celsius and km/h**, not the
    Fahrenheit the docs claim (cross-checked against Open-Meteo at five
    stations, within 1-4 degrees).
  - On 2026-10-19 the only primary conditions were Bare Dry, Bare Wet,
    Closed, No Report; secondary: Bare Wheel Paths, Strong Wind, Rain, Frost,
    Fog Patches (padded with spaces); visibility: Good or null. Winter values
    come from 511's definitions page and match by keyword; unknown values
    count as yellow and are logged by the sync. "Strong Wind" and "No Report"
    are yellow (my call; see the comments in `config.ts`).
  - Events: 71 of 246 had start dates in the future, so events count only
    when active or starting within 12 h. Recurrence schedules (e.g. 8 AM to
    7 PM) are not modelled; an event counts for its whole date range.
  - The camera feed had `"N/A"` roadways and view names (now cleaned), and
    many cameras with every view Disabled (Banff town, Red Deer).
- 2026-10-19 (Phase 6B): **Routes** are OSRM driving routes on OSM data
  (`scripts/build-trip-routes.mjs`; Overpass was down), trimmed to start
  where Hwy 1 / Hwy 2 cross Stoney Trail (anchored on 511's own interchange
  cameras) and simplified at 15 m. Mountain trips end in town (Banff via Banff
  Ave, so Town of Banff cameras match); Edmonton ends at the Henday. Town
  names along each route come from Nominatim (Kananaskis Village was dropped:
  ~20 km off Hwy 1). Reasons say "near <nearest town by km>".
- 2026-10-19 (Phase 6B): **Segment matching** measured on real data: at 150 m,
  every Hwy 1 / QEII segment had 0.64-1.00 of its length on the line (the one
  running past the Henday: 0.45), while Hwy 2A (beside the QEII near
  Lacombe) and crossing roads had at most 0.26. So 150 m and a 0.40 share,
  per carriageway line (where carriageways split, only one is on our line).
  500 m (the brief's starting point) is kept for cameras and events.
- 2026-10-19 (Phase 6B): **Areas.** The Bow Valley box now reaches east to
  Calgary's edge (-114.32) for Hwy 1 cameras between the city and the
  mountains. New area `qe2` = 511 cameras within 1 km of the QEII route
  between the city boxes (a corridor, not a box, which would also catch Red
  Deer streets and Hwy 11). Filter label "QEII"; map fly-to "QEII".
- 2026-10-19 (Phase 6B): **Freshness.** `dataUpdatedAt` is the older of the
  last successful conditions and events syncs. Over 30 min: "Data may be out
  of date" and green becomes grey "Can't confirm"; yellow and red stay.
  Each feed replaces its table only when it synced, so a failing feed ages
  instead of vanishing.
- 2026-10-19 (Phase 6B): **Homepage.** `/` redirects (307, next.config) to
  `/trip`; `/?cam=` redirects to `/map?cam=` (query passes through, colon
  percent-encoded). `/trip` is a static shell with the `?to=` reader in
  Suspense (required for `useSearchParams` in a prerendered page).
- 2026-10-19 (Phase 6B): **Push.** `web-push` 3.6.7. A subscription row per
  (endpoint, trip). `baseline` is the verdict the subscriber last heard
  about (or saw when subscribing); alert when worse, at most once an hour
  (a worsening inside the hour waits for the next sync after it), quietly
  lower the baseline when it improves. Unknown/stale verdicts never alert.
  Delete on 400/401/403/404/410 from the push service; keep on 429/5xx and
  timeouts. Local VAPID keys were generated into `.env`; production keys and a
  real `VAPID_SUBJECT` are in TODO.md.
- 2026-10-19 (Phase 6B): **Testing push.** Playwright launches Chrome with
  `--disable-background-networking`, which kills Chrome's FCM connection, so
  subscriptions are born dead (FCM 410). Use `channel: "chrome"` and
  `ignoreDefaultArgs: ["--disable-background-networking"]`; then a test push
  arrives (verified: subscribe -> /api/push/test -> notification shown ->
  turn off). Playwright's bundled Chromium can't do push at all.
- 2026-10-19 (Phase 6B): **e2e.** `npm run test:e2e` (Playwright 1.64.0, as
  1.64.1 was under 7 days old), mobile (Pixel 7) and desktop projects, 2
  workers against the dev server. One test runs against whatever the DB
  holds (passes on an empty CI database); the content tests replay a saved
  real `/api/trips/banff` response (`e2e/fixtures/trip-banff.json`).

- 2026-10-19 (Phase 8): **Baseline** (Lighthouse 13.5, prod build on :3100,
  own PGlite dir): Trip Check 46 mobile / 47 desktop, map 57 / 78, wall
  74 / 98; accessibility 100 everywhere. Causes, in order: MapLibre (1 MB)
  loading on /trip for a below-the-fold mini map (4.7 s of mobile main
  thread), layout shift 0.27 / 0.73 (skeleton != layout, footer on screen),
  Zod's eval probe tripping our CSP on every page, /map prefetch from header
  links, the detail sheet and cmdk in the first bundle, 625-row camera list.
- 2026-10-19 (Phase 8): **Fixes.** /trip renders the verdict on the server
  (streamed PPR hole; `getCachedTripReport`, `use cache` 60 s, tag
  `trip-report` revalidated by sync) and hands it to TanStack as initial
  data; the picker uses `history.replaceState` (shallow). Mini map = SVG
  `RoutePreview`, MapLibre on "Explore map". Skeleton mirrors the layout,
  verdict card min-height, alert key passed from the server (no
  /api/push/key, route removed), main is min-h-dvh. Lazy camera sheet,
  palette and add-camera dialog; `IntentLink`; tooltips only in the map
  shell (theme toggle uses `title`); Zod out of the browser bundle (guards;
  wall keeps zod/mini); windowed camera list (48 px rows, aria-setsize);
  display paths simplified to 40 m in the report; first strip photo eager
  - fetchPriority high (it's the real-network LCP). JS on /trip: 311 KB ->
    207 KB gzipped.
- 2026-10-19 (Phase 8): **Wall cookie.** /wall is server-rendered from the
  URL, else the `camalberta_wall` cookie (1 year; grid + camera ids only,
  parsed by the same strict schema). localStorage stays the source for older
  saved walls (read after mount). Tightened in Phase 9, see below.
- 2026-10-19 (Phase 8): **Measuring.** Lighthouse's default (simulated)
  mobile run on localhost is noisy for /trip (86 to 95): every script
  finishes before the first paint locally, so the simulation charges all JS
  to the LCP. Report the median of several runs plus applied (devtools)
  throttling, which is steady. The map's mobile score is limited by MapLibre
  under software WebGL (SwiftShader); kept MapLibre (brief) rather than a
  facade on the map page. Next time: resized thumbnails (needs an image
  resizer such as sharp) would cut ~35-60 KB photos to a few KB.
- 2026-10-19 (Phase 8): **Accessibility.** Skip link + focusable #main on
  every page; camera list rows got a focus ring (was outline-none only);
  Radix sheets returned focus to <body> (they only return to a Trigger) ->
  patched SheetContent; keyboard reordering on the wall (move buttons);
  route preview is role=img with a title. Playwright covers these, plus
  security headers and input validation (the Phase 7 follow-up).
- 2026-10-19 (Phase 8): **Fixture encoding.** The 6B events fixture had 2
  mojibake strings ("Mînî Thnî" read as cp1252 on Windows) and the e2e trip
  fixture had "—" mangled; both re-saved as UTF-8 from the raw responses.
  Always pass `encoding="utf-8"` when Python reads or writes fixtures here.

- 2026-10-19 (after Phase 8, owner request): the Trip Check note under the
  verdict is now a source line, "Data from official 511 Alberta, refreshed
  every 15 minutes." (link on "511 Alberta"), replacing "This is a guide, not
  a safety guarantee. Always check official 511 Alberta before you travel."
  The owner felt it undersold the official data. Freshness is still shown
  ("Updated X min ago"), and stale data still warns and never shows green.

- 2026-10-19 (Phase 9): **Where collection runs** (owner: "always on, not my
  laptop", free). Vercel Hobby allows cron at most once a day (a `*/15`
  schedule fails the deploy), and a free Cloudflare Worker cron has 10 ms CPU
  and can't run sharp. So `.github/workflows/collect.yml` (free on public
  repos) runs at :07/:22/:37/:52: it POSTs `$APP_URL/api/sync` (keeps Trip
  Check fresh; replaces the 15-min Vercel cron, now a daily backstop in
  `vercel.json`), then `npm run collect` against Postgres + R2. Resizing on
  GitHub's CPU also keeps it off Vercel's 4 h Active CPU allowance. Each step
  is skipped until its secrets exist. Prod DB recommendation: Supabase
  (Neon free caps compute at 100 CU-hours; a 15-min job keeps it awake
  ~40-50%). Supabase direct connections are IPv6-only: use the transaction
  pooler for the app and the job, the session pooler for migrations.
- 2026-10-19 (Phase 9): **Standalone script.** `node --conditions=react-server
--import tsx scripts/collect.ts`: the condition makes `server-only` resolve
  to its empty build, tsx handles TS and `@/` paths, `main()` wrapper (tsx
  runs it as CJS, no top-level await). It refuses PGlite unless `--pglite`
  (the dev server owns that folder); locally use `POST /api/collect`.
- 2026-10-19 (Phase 9): **What's collected.** Bow Valley `alberta511` +
  `banff` cameras that aren't offline (37; Sunshine left out: ski runs, not
  roads). Per photo: 512 px JPEG q80 mozjpeg (~20 KB, original ~176 KB),
  sha256, brightness, the nearest 511 condition segment within 300 m, the
  nearest weather station within 30 km, auto label. No 511 calls: it reads
  the sync's tables. The sync now also keeps conditions/stations near the
  collector cameras (25 conditions / 14 stations, was 23 / 11).
- 2026-10-19 (Phase 9): **Frozen feeds.** Skip when the sha256 equals the
  camera's last snapshot's (`selectDistinctOn`) and when Last-Modified is over
  30 min old (a weeks-old frame would get today's label). First run: 31
  saved, 6 stale (rimrock N/S, middle-springs, valleyview, train E/W); rerun
  14 s later: 31 unchanged.
- 2026-10-19 (Phase 9): **Labels** (`collect/labels.ts`): Bare Dry/Wet ->
  dry/wet; /partly/ -> partly_snow; /covered|packed/ -> snow_covered (ice
  folded in, brief); "Bare Wheel Paths" makes bare roads partly_snow; Poor
  visibility -> cant_see; Closed/No Report -> no label. Brightness < 30 or
  > 235 -> cant_see first (measured at 9 PM: dark 21-44, infrared night
  > views 74-98, white "no image" card 245). Banff street cameras have no 511
  > segment, so they get no auto label and need a human.
- 2026-10-19 (Phase 9): **Storage.** R2 through `aws4fetch` (S3 SigV4,
  path-style, region `auto`), payload SHA-256 signed (aws4fetch defaults to
  UNSIGNED-PAYLOAD), GET capped at 2 MB. Dev: `.data/snapshots`. Keys
  `snapshots/<source>_<id>/yyyy/mm/dd/hhmmss-<hash12>.jpg` (UTC), validated
  on every put/get; the local store also checks the resolved path. Estimate:
  <= 2.1 GB/month of photos, 107k rows (~45 MB) and 107k Class A ops; R2's
  free 10 GB-month lasts ~5 months, then ~$0.015/GB-month.
- 2026-10-19 (Phase 9): **Thumbnails** (Phase 8 follow-up): image route
  `?w=320` (only that value) -> 320 px JPEG q75, ~7 KB vs 176 KB, cached per
  camera keyed on the identical cached-original bytes object, so one resize
  per new photo and the same Cache-Control as the photo. The Trip Check
  strip uses it. sharp 0.35.5 (Next keeps it external automatically).
- 2026-10-19 (Phase 9): **Admin.** `/admin/*` needs HTTP Basic (replaced
  on 2026-10-20, see "Harden admin auth" below), checked in `proxy.ts` and
  again in every admin page, route and action. The snapshot image route lives under `/admin` so the browser sends the cached
  login with it; label saves are a server action (Next checks the Origin;
  the action re-checks the login, rate limit and a strict Zod object).
- 2026-10-19 (Phase 9): **Turbopack watched `.data`.** `path.resolve(
process.cwd(), ...)` made Turbopack trace the whole project, so in dev every
  PGlite or snapshot write triggered Fast Refresh and full page reloads
  (label state reset every few seconds). Fix: `/*turbopackIgnore: true*/` as
  the first argument comment in `db/index.ts` and `storage/snapshots.ts`.
  Do the same for any new runtime data path.
- 2026-10-19 (Phase 9): **Wall cookie tightened** (owner request): always
  `Secure; SameSite=Lax; Path=/wall`, written only if <= 2,048 chars, and the
  server validates it with Zod (length + charset) before the wall schema.
  Gotcha found by an e2e probe: Next's `cookies()` decodes values once, so
  the schema must expect `grid=3&cams=...`, not the stored `%3D` form (the
  first version rejected every real cookie; unit tests had passed the
  encoded form). e2e now covers browser -> server.

- 2026-10-20 (owner request, before deploying): **Harden admin auth.**
  - Separate login (`ADMIN_USERNAME` + `ADMIN_PASSWORD`, password 16+ chars
    and != `CRON_SECRET`, enforced by the env schema). `CRON_SECRET` (Bearer
    or as a password) no longer opens /admin.
  - `ADMIN_ENABLED`: the owner turns it on only while labelling (Vercel needs
    a redeploy to apply variable changes). Off = the normal 404 page, same
    status, body and headers as a missing page. A bogus server-action POST
    gets the same 400 as on a missing page. `env.ts` refuses
    `ADMIN_ENABLED=true` without a login.
  - Lockout in Postgres, not memory: Next's proxy docs warn against relying
    on module globals, and on Vercel memory differs per instance and resets
    on cold starts. One atomic upsert per failure (five concurrent failures
    count exactly 1 to 5, unit tested on PGlite). IPv6 is keyed by /64
    (one connection usually gets a whole /64).
  - `/admin` redirects to `/admin/label` (a signed-in visit used to hit a
    404). `robots.ts` disallows `/admin` and `/api/`.
  - `collect.yml`: secrets moved from job env to the steps that use them,
    so `npm ci` (dependency install scripts) never sees them. CI e2e uses
    throwaway admin credentials (not secrets).
  - **Testing on Postgres locally:** `@electric-sql/pglite-socket@0.2.11`
    (matches PGlite 0.5.8), installed in a scratch folder only, never the
    project. Run `server.js --db=<dir> --port=5433 --max-connections=50` and
    set `DATABASE_URL=postgres://postgres@127.0.0.1:5433/postgres`. Caveat:
    its multiplexer interleaves concurrent queries from different
    connections ("unnamed prepared statement does not exist", 26000), so
    `runCollection` (parallel queries, pool of 5) fails there but works with
    a 1-connection pool. Real Postgres and Supabase's transaction pooler
    don't do this. Verified this way: sync, collector (31 saved, then 31
    unchanged), login, lockout rows, and `/api/health` still 500s (the
    known TODO).
  - Git history (17 commits) scanned before going public: no `.env` value,
    key file or credential pattern; only the deliberate CI throwaway value.
- 2026-10-20: **Push routes validate first.** CI e2e failed: with no VAPID
  keys, subscribe answered 503 before checking the request, so a cross-site
  request got 503 instead of 403. Subscribe now runs rate limit, query and
  body checks first and the "push configured?" 503 last (unsubscribe never
  checks it, so people can always clean up). `src/lib/push/routes.test.ts`
  calls both handlers with push off and on, with a database stub that
  throws if touched. CI's e2e job generates a throwaway VAPID pair per run
  (`web-push`, private key masked, written to `$GITHUB_ENV`), so push
  behaves like production. To run e2e without push locally, start the dev
  server with `VAPID_PUBLIC_KEY= VAPID_PRIVATE_KEY= VAPID_SUBJECT=`: set
  but empty, they win over `.env`, and the env schema treats empty as unset.
- 2026-10-20: **Vercel region yul1 (Montréal).** The Town of Banff camera
  server refused requests from iad1 (Washington): all 17 Banff cameras were
  placeholders in production. From yul1 all 17 load.
- 2026-10-20: **Link previews.** Every page uses `pageMetadata()`
  (`src/lib/site.ts`): a page that sets `openGraph` replaces the layout's
  whole block, including the file-based image, so the helper always sets
  siteName, locale en_CA, type, url and the share image explicitly.
  Previews never include the live verdict (platforms cache them for days).
  Icons and the 1200x630 share image (~63 KB) come from SVG via sharp
  (`npm run build:icons`); favicon.ico holds 16/32/48 PNGs. Share images
  and icons send `Cross-Origin-Resource-Policy: cross-origin`; everything
  else stays same-origin. `e2e/seo.spec.ts` checks the tags as each
  crawler sees them.

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
- [x] 6B Trip Check (spec in `PROMPT.md`)
- [x] 7 Security review
- [x] 8 Performance and polish
- [x] 9 Road condition data collection (prod setup steps in `TODO.md`)
- [ ] 10 Road condition model
- [ ] 11 Ship it
