# CamYYC

Live traffic and road cameras for **Calgary**, the **Banff / Bow Valley
corridor** (Canmore, Banff, Sunshine Village, Lake Louise) and **Edmonton** on
one fast map. Photos refresh on their own the moment a camera publishes a new
one; Edmonton's cameras are **real live video**. Later phases add an
experimental AI estimate of road conditions (dry, wet, snow) on the mountain
highways.

> Status: early development (Phase 0, app shell). Built as a school project.

## Features

Planned. See the phase list in [CLAUDE.md](CLAUDE.md).

## Local setup

Requires Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env   # optional: everything works with the defaults
npm run db:migrate     # create the database tables
npm run dev            # http://localhost:3000
```

With no `DATABASE_URL`, the app uses [PGlite](https://pglite.dev), an embedded
Postgres stored in `.data/pglite`. Set `DATABASE_URL` to use Neon, Supabase or
any other Postgres.

### Loading camera data

Cameras are pulled from upstream on a schedule by `/api/sync` (Vercel Cron runs
it every 15 minutes in production). To fill the database locally, set
`CRON_SECRET` in `.env`, start the dev server, and trigger a sync once:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/sync
```

Calgary, Town of Banff, Sunshine Village and Edmonton cameras load with no
extra setup. Provincial highway cameras need a 511 Alberta developer key in
`ALBERTA_511_API_KEY` (see `TODO.md`); without it the 511 source is skipped.

### API

| Route                             | Returns                                            |
| --------------------------------- | -------------------------------------------------- |
| `GET /api/cameras`                | All cameras as GeoJSON (cached 5 min)              |
| `GET /api/cameras/[id]`           | Full details for one camera                        |
| `GET /api/cam/[id]/image`         | Proxied live snapshot (jpeg/png, or a placeholder) |
| `GET /api/cam/[id]/live`          | Live video playlist (HLS) for video cameras        |
| `GET /api/cam/[id]/live/[seq].ts` | One live video segment (MPEG-TS)                   |
| `GET /api/health`                 | Camera counts per source and last sync time        |
| `POST /api/sync`                  | Run a sync (requires `CRON_SECRET`)                |

Every route is rate limited and validates its input with Zod. Image and stream
URLs are never exposed to the browser; the proxies look cameras up by our own
id. Add `?refresh=1&r=<any number>` to the image route to check the camera for
a new photo right now (reused if the last check was under 3 seconds ago).

### Scripts

| Command               | What it does                            |
| --------------------- | --------------------------------------- |
| `npm run dev`         | Start the dev server                    |
| `npm run build`       | Production build                        |
| `npm run check`       | Lint, typecheck, format check and tests |
| `npm run test`        | Run unit tests (Vitest)                 |
| `npm run format`      | Format everything with Prettier         |
| `npm run db:generate` | Generate SQL migrations from the schema |
| `npm run db:migrate`  | Apply migrations (Postgres or PGlite)   |
| `npm run db:studio`   | Browse the database                     |

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, MapLibre GL JS with
OpenFreeMap tiles, PostgreSQL with Drizzle ORM (PGlite in dev), TanStack Query,
Zod, Vitest, Playwright. The road condition model (later phases) lives in `/ml`
and uses Python and PyTorch.

## Data sources

Data: City of Calgary (Open Government Licence) and 511 Alberta.

- **City of Calgary traffic cameras**:
  [dataset](https://data.calgary.ca/Transportation-Transit/Traffic-Cameras/k7p9-kppz),
  used under the
  [Open Calgary Terms of Use](https://data.calgary.ca/stories/s/Open-Calgary-Terms-of-Use/u45n-7awa).
- **511 Alberta**: provincial highway cameras and road conditions,
  [511.alberta.ca](https://511.alberta.ca/).

Cameras also © their owners, credited in the app:

- **Town of Banff** street cameras,
  [banff.ca/trafficcams](https://banff.ca/trafficcams).
- **Banff Sunshine Village** webcams,
  [skibanff.com](https://www.skibanff.com/the-mountain/mountain-report/webcams).
- **City of Edmonton** live traffic video,
  [edmontontrafficcam.com](https://edmontontrafficcam.com/), used under the
  City's [Conditions of Use](https://www.edmonton.ca/conditionsofuse)
  (personal, educational, non-commercial).

Camera positions for Banff and Sunshine Village come from
[OpenStreetMap](https://www.openstreetmap.org/copyright) (© OpenStreetMap
contributors), since those owners don't publish coordinates.

The browser never calls these services directly. Our backend syncs on a
schedule, caches, and proxies images and live video, which respects upstream
rate limits: each camera is fetched once however many people watch it.

## Security

Security headers (CSP, HSTS and others) are set in `next.config.ts`. Every
input is validated with Zod (bad input gets a 400), every API route is rate
limited, and the camera proxies only serve cameras that are already in our
database. They fetch over https from each source's own host and never follow
a redirect anywhere else. CI runs lint, typecheck, tests and the production
`npm audit` on every push, CodeQL scans the code, and Dependabot keeps
dependencies current.

- Found a vulnerability? See [SECURITY.md](SECURITY.md) for how to report it
  privately.
- The Phase 7 review, with every check and fix:
  [SECURITY_REVIEW.md](SECURITY_REVIEW.md).

## License

[MIT](LICENSE)
