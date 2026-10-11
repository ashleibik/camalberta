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
npm run dev            # http://localhost:3000
```

With no `DATABASE_URL`, the app uses [PGlite](https://pglite.dev), an embedded
Postgres stored in `.data/pglite`. Set `DATABASE_URL` to use Neon, Supabase or
any other Postgres.

### Scripts

| Command               | What it does                            |
| --------------------- | --------------------------------------- |
| `npm run dev`         | Start the dev server                    |
| `npm run build`       | Production build                        |
| `npm run check`       | Lint, typecheck and format check        |
| `npm run format`      | Format everything with Prettier         |
| `npm run db:generate` | Generate SQL migrations from the schema |
| `npm run db:migrate`  | Apply migrations                        |
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
