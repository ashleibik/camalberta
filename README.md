# CamYYC

Live traffic and road cameras for **Calgary** and the **Banff / Bow Valley
corridor** (Canmore, Banff, Lake Louise) on one fast map, with snapshots that
refresh on their own. Later phases add an experimental AI estimate of road
conditions (dry, wet, snow) on the mountain highways.

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

Calgary cameras load with no extra setup. Bow Valley / Banff highway cameras
need a 511 Alberta developer key in `ALBERTA_511_API_KEY` (see `TODO.md`);
without it the 511 source is skipped.

### API

| Route                     | Returns                                            |
| ------------------------- | -------------------------------------------------- |
| `GET /api/cameras`        | All cameras as GeoJSON (cached 5 min)              |
| `GET /api/cameras/[id]`   | Full details for one camera                        |
| `GET /api/cam/[id]/image` | Proxied live snapshot (jpeg/png, or a placeholder) |
| `GET /api/health`         | Camera counts per source and last sync time        |
| `POST /api/sync`          | Run a sync (requires `CRON_SECRET`)                |

Every route is rate limited and validates its input with Zod. Image URLs are
never exposed to the browser; the proxy looks cameras up by our own id.

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

The browser never calls these services directly. Our backend syncs on a
schedule, caches, and proxies images, which respects upstream rate limits.

## Security

Security headers (CSP, HSTS and others) are set in `next.config.ts`. Every
input is validated with Zod, and the image proxy only serves cameras that are
already in our database. A full `SECURITY.md` and security review arrive in
Phase 7.

## License

[MIT](LICENSE)
