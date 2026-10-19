# Project brief for Claude Code: CamAlberta

You are building **CamAlberta**, an open source, full stack web app that shows every **public** traffic and road camera in **Calgary**, the **Banff / Bow Valley corridor** (Canmore, Banff, Lake Louise) and **Edmonton** on a fast, smooth map with live refreshing snapshots. Later phases add AI road condition detection (dry, wet, snow) for the mountain highways.

## How to work

- Work in phases, in order. Commit to git at the end of every phase with a message like `Phase 3 complete`.
- **Interactive mode (default):** stop after each phase, show me what you built and how to run it, and wait for my OK.
- **Autonomous mode:** if I tell you to run autonomously, don't stop or ask questions. Make reasonable choices and log them in `CLAUDE.md` under "Decisions made while autonomous". Put anything that needs my accounts, secrets, or a human decision in `TODO.md`.
- Keep `CLAUDE.md` updated with decisions, commands, and conventions.
- Before writing an adapter, fetch the real API response and build types from it. Never assume field names.

---

## Hard rules

1. **Only public, officially published camera feeds.** No private CCTV, no guessing camera URLs, no bypassing logins. If a source's terms don't allow reuse, skip it and note it in `TODO.md`.
2. **No identifying people.** No face recognition, license plate reading, or tracking individuals. AI features only classify road conditions or count objects.
3. **Respect rate limits.** The browser never calls upstream APIs or camera hosts directly. Everything goes through our backend, which caches.
4. **Attribution.** Show "Data: City of Calgary (Open Government Licence) and 511 Alberta" in the app footer and README.
5. **Security is part of every phase, not an afterthought.** Follow the Security rules below as you build.
6. TypeScript strict mode everywhere. No `any` unless justified in a comment.

---

## Security rules (apply in every phase)

- **No open proxy.** The image proxy only serves cameras that exist in our DB, looked up by our own ID. Never accept a URL from the client.
- **Validate all input.** Every route param, query param, and body is checked with Zod. Bad input returns 400.
- **Validate all upstream data** with Zod before it touches the DB.
- **No unsafe HTML.** Never use `innerHTML` or `dangerouslySetInnerHTML` with external data. Camera names and descriptions are rendered as text only.
- **Rate limiting** on every `/api` route, stricter on the image proxy.
- **Security headers** in `next.config`: CSP (own origin plus map tile host only), HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` that turns off camera, mic, and geolocation.
- **Secrets** live only in env vars. `.env` is in `.gitignore`. Commit only `.env.example`.
- **Protected routes** (`/api/sync` and any admin route) check `CRON_SECRET` with a timing safe compare.
- **Errors** never leak stack traces or internal URLs to the client.
- **Dependencies:** run `npm audit` at the end of each phase and fix high and critical issues.

---

## Data sources

### 1. City of Calgary traffic cameras (open data)

- Endpoint: `https://data.calgary.ca/resource/k7p9-kppz.json?$limit=1000`
- Fields include `camera_url.url` (e.g. `http://trafficcam.calgary.ca/loc65.jpg`), `camera_location`, `quadrant`, `point.coordinates` [lng, lat]
- Images are **http only**, so they must go through our proxy to work on https

### 2. 511 Alberta (provincial highway cameras, covers Calgary area highways, Banff / Bow Valley and Edmonton)

- Docs: `https://511.alberta.ca/developers/doc`
- Cameras: `https://511.alberta.ca/api/v2/get/cameras?format=json`
- Also has road conditions and weather stations, which the AI phases use
- **Throttled to 10 calls per 60 seconds.** Sync on a schedule and cache. Never call per user request.
- Filter to configurable bounding boxes:
  - Calgary: lat 50.84 to 51.22, lng -114.32 to -113.85
  - Bow Valley: lat 50.95 to 51.45, lng -116.30 to -115.25
  - Edmonton (added later): lat 53.35 to 53.75, lng -113.80 to -113.20

### 3. Optional later

Other webcams only if openly published or we have permission. Each source is its own adapter file. (Added later: Town of Banff, Banff Sunshine Village, City of Edmonton live video. See `CLAUDE.md`.)

---

## Tech stack

- **Next.js (App Router) + TypeScript** for frontend and backend
- **Tailwind CSS + shadcn/ui** (https://ui.shadcn.com), installed with the shadcn CLI
- **MapLibre GL JS** with free OpenFreeMap tiles
- **PostgreSQL + Drizzle ORM.** For local dev with no `DATABASE_URL`, use **PGlite** (embedded Postgres). Switch to Neon or Supabase in production by setting `DATABASE_URL`.
- **TanStack Query** for client data fetching
- **Zod** for validation
- **Vitest** for unit tests, **Playwright** for end to end smoke tests
- **Python + PyTorch** (in a separate `/ml` folder) for the road condition model
- Deploy: **Vercel** with Vercel Cron
- License: **MIT**

---

## Design

### Look and feel

A clean, dark "operations console" look. Calm and readable, not a hacker movie.

- Dark mode default with light mode toggle (`next-themes`)
- Base color zinc. Green `#22c55e` for live, amber for stale, red for offline
- Road condition colors: dry gray, wet blue, partly snow light purple, snow covered white, can't see dark gray
- Fonts: **Geist** for UI, **Geist Mono** for coordinates, timestamps, IDs
- Radius `0.75rem`, subtle borders, minimal shadows
- Transitions 150 to 200ms, respect `prefers-reduced-motion`
- Fully responsive. On mobile the sidebar becomes a bottom Sheet

### Layout (desktop)

```
┌────────────┬──────────────────────────────────┬──────────────┐
│  Sidebar   │                                  │  Camera      │
│            │             MAP                  │  detail      │
│  Search    │   (clustered camera markers)     │  panel       │
│  Filters   │                                  │  (opens on   │
│  Camera    │                                  │   click)     │
│  list      │                                  │              │
├────────────┴──────────────────────────────────┴──────────────┤
│ Status bar: cameras online · last sync · attribution         │
└───────────────────────────────────────────────────────────────┘
```

### Views

1. **Map view** (home): clustered markers colored by status. Hover tooltip with name. Click opens detail panel.
2. **Camera detail panel**: live snapshot, name, source, road, direction, quadrant, coordinates, "updated X sec ago", favorite, "open on map", "add to wall". After the AI phases: official 511 condition and AI estimate shown side by side.
3. **Camera wall** (`/wall`): live grid, 1x1 / 2x2 / 3x3 / 4x4, drag to reorder, layout saved in the URL.
4. **Command palette** (Ctrl/Cmd + K): search cameras by name or road.

### shadcn components

`sidebar`, `command`, `sheet`, `card`, `badge`, `button`, `toggle-group`, `tabs`, `input`, `select`, `checkbox`, `tooltip`, `skeleton`, `scroll-area`, `dialog`, `dropdown-menu`, `separator`, `sonner`

### Filters

Area (All / Calgary / Bow Valley / Edmonton), Source, Quadrant, Status, Favorites only. After AI phases: Road condition.

---

## Phases

### Phase 0: Setup

- Next.js app with TypeScript, Tailwind, ESLint, Prettier. Init shadcn/ui.
- Drizzle with PGlite fallback, `.env.example`, `.gitignore` with `.env`
- `CLAUDE.md`, `README.md` skeleton, MIT `LICENSE`, `TODO.md`
- Security headers in `next.config` from day one
- Empty app shell in the dark theme matching the layout
- **Done when:** `npm run dev` shows the shell, lint and typecheck pass

### Phase 1: Data layer

- Normalized `Camera` table: `id, source, sourceId, name, road, direction, quadrant, area, lat, lng, imageUrl, status, lastSeenAt, updatedAt`
- One adapter per source in `src/lib/sources/`, validated with Zod
- `sync` function: runs adapters, upserts, marks missing cameras offline
- `/api/sync` protected with `CRON_SECRET` (timing safe compare), plus Vercel Cron every 15 minutes
- Unit tests per adapter using saved sample responses
- **Done when:** sync fills the DB with real Calgary and Bow Valley cameras and tests pass

### Phase 2: Image proxy

- `/api/cam/[id]/image`: Zod validate the ID, look it up in the DB, fetch upstream, return with `Cache-Control: public, s-maxage=30, stale-while-revalidate=60`
- Rate limited. Upstream timeout of 5 seconds. Only return `image/jpeg` or `image/png`, otherwise placeholder.
- On upstream failure: placeholder image and mark camera stale
- Client adds a time bucket param `?t=floor(now/30s)` so users share the cache
- **Done when:** images load over https, cache hits work, unknown IDs return 404

### Phase 3: API

- `GET /api/cameras`: compact GeoJSON, cached 5 minutes
- `GET /api/cameras/[id]`: full details
- `GET /api/health`: counts per source and last sync time
- All rate limited and Zod validated
- **Done when:** endpoints are typed end to end and return correct data

### Phase 4: UI shell

- Sidebar, filters, status bar, theme toggle, command palette with shadcn
- Skeleton loading, empty states, error toasts with `sonner`
- **Done when:** layout matches the design on desktop and mobile

### Phase 5: Map

- MapLibre centered on Calgary, with a "fly to Banff" button
- Clustered GeoJSON, status colored circles, hover tooltips
- Filters apply client side instantly, no refetch
- Clicking a marker opens the panel and sets `?cam=ID` in the URL
- **Done when:** pan and zoom stay smooth with all cameras loaded

### Phase 6: Camera viewer and wall

- Snapshot refreshes every 30 seconds only while the panel is open
- Preload next image, swap on load, no blank flash
- Pause refreshing when the tab is hidden
- `/wall` with grid layouts, drag to reorder, layout in URL (validated with Zod when read)
- Favorites in `localStorage`, wrapped in try/catch
- **Done when:** a 4x4 wall runs smoothly with no flicker

### Phase 6B: Trip Check

One page at `/trip` that answers "Should I drive to the mountains today?" in 5 seconds. Follow all Hard rules and Security rules above.

**Data** (no Google Maps, no paid APIs):

- 511 Alberta API (https://511.alberta.ca/developers/doc): Road Conditions, Events (closures, avalanche control, collisions, construction) and Weather Stations, plus the cameras we already sync. The API requires a developer key: `ALBERTA_511_API_KEY` in `.env` (see `TODO.md`).
- Before writing any code, fetch real responses from each endpoint, save samples as fixtures, and build Zod schemas from the actual fields. Do not guess field names or condition values.
- Respect the 10 calls per 60 seconds limit: fetch everything in the existing scheduled sync job, store it in the DB, and serve from our DB only.

**Routes:**

- Four fixed trips: Calgary to Canmore, Calgary to Banff and Calgary to Lake Louise on Highway 1, and Calgary to Edmonton on Highway 2 (QEII).
- Store each route as a simplified line from OpenStreetMap data, saved as GeoJSON in the repo, with OSM attribution in the README.
- Match cameras, road condition segments, events and weather stations to a route if they're within a set distance of the line (configurable, start at 500 m for cameras and events). Order cameras by distance along the route so they appear in driving order.

**Verdict** (rule based, simple, explainable):

- RED "Check before you go": any closure or major event on the route, or any official condition that means travel not recommended or closed.
- YELLOW "Drive carefully": any segment with snow, ice, partly covered or poor visibility, or any minor event like construction.
- GREEN "Looks good": none of the above.
- Map the actual 511 condition values to these levels in one config file with comments, so it's easy to adjust.
- Always show why: list the exact reasons ("Snow covered near Canmore", "Avalanche control near Lake Louise").
- If our data is older than 30 minutes, show a "Data may be out of date" warning and don't show green.
- Always show this disclaimer with a link to 511 Alberta: "This is a guide, not a safety guarantee. Always check official 511 Alberta before you travel."

**UI** (shadcn, matching the existing design, mobile first, since people check this on their phone before leaving):

- Trip picker at the top (toggle group: Canmore / Banff / Lake Louise / Edmonton), saved in the URL like `/trip?to=banff`
- Big verdict card with color, label, reasons and "updated X min ago"
- Route camera strip: horizontal scroll of camera snapshots in driving order, with the name and distance from Calgary on each. Tap one to open the existing camera detail panel.
- Mini map showing the route line, cameras and events
- Condition list per segment, with weather (temperature, wind) from the nearest station
- "Trip Check" in the sidebar and as the default homepage, with the full camera map one click away

**Alerts** (browser push, no accounts, no emails stored):

- "Notify me if this trip gets worse" button using the Web Push API with self generated VAPID keys (in `.env.example` and `TODO.md`)
- Store only the push subscription and chosen trip, nothing else. Add an easy unsubscribe button. Delete subscriptions that fail delivery.
- After each sync, if a trip's verdict gets worse (green to yellow, yellow to red), send a push with the new verdict and the main reason. Don't send more than one alert per trip per hour per subscriber.
- Rate limit and Zod validate the subscribe and unsubscribe endpoints.

**Tests:**

- Unit tests for route matching, camera ordering and the verdict logic using the saved fixtures, including the stale data case
- A Playwright test that loads `/trip?to=banff` and sees a verdict card and camera strip

- **Done when:** build, lint, typecheck, tests and `npm audit` all pass, `/trip` shows a real verdict for all four trips from real 511 data, and a test push notification works locally. Commit as `Phase 6B complete`.

### Phase 7: Security review

- Go through every Security rule above and confirm each one is actually in place
- Search the codebase for `innerHTML`, `dangerouslySetInnerHTML`, `eval`, and unvalidated params
- `npm audit` clean of high and critical
- Add `SECURITY.md` (how to report a vulnerability), Dependabot config, CodeQL workflow
- Write `SECURITY_REVIEW.md` listing every check and fix
- **Done when:** all checks pass and the review file is written

### Phase 8: Performance and polish

- Lighthouse 90+ on performance and accessibility
- Lazy load map and wall, keep initial JS small
- Keyboard navigation, visible focus, alt text, ARIA labels
- **Done when:** Lighthouse targets met and Playwright smoke tests pass

### Phase 9: Road condition data collection

- Scheduled job that every 15 minutes saves a snapshot from each **Bow Valley** camera, plus the 511 Alberta road condition for that highway and the nearest weather station reading at the same moment
- Store images in object storage (local folder in dev, configurable for Cloudflare R2 or Supabase Storage in prod) and metadata in a `snapshots` table
- Map 511 conditions to our labels: `dry`, `wet`, `partly_snow`, `snow_covered`, `cant_see`. No separate ice class, since ice isn't reliably visible in photos.
- Respect the 511 rate limit (batch all calls, cache)
- Simple `/admin/label` page (protected) to review and correct labels by hand
- **Done when:** the job runs, snapshots and labels save correctly, and the label page works

### Phase 10: Road condition model

- In `/ml`: Python script to export the labeled dataset, fine tune a small pretrained model (MobileNetV3 or EfficientNet B0), and report accuracy per class
- **Split train and test by camera**, not by image, so accuracy reflects cameras the model has never seen
- Export to ONNX and run inference in the backend after each sync
- Show "AI estimate" with confidence next to the official 511 condition in the detail panel, plus a road condition map filter
- Clearly label it as experimental
- **Done when:** model accuracy is reported honestly in the README and estimates show in the app

### Phase 11: Ship it

- Deploy to Vercel, set env vars, confirm cron jobs run
- Finish README: screenshot, features, stack, local setup, data sources with licence links, how to add a source, security notes, model accuracy
- `CONTRIBUTING.md` and GitHub issue templates
- **Done when:** live URL works and the repo is ready to share

---

Start with **Phase 0**. In interactive mode, give me a short plan for the phase before writing code.
