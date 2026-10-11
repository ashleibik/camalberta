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
src/lib/sources/         one adapter per camera source (Phase 1)
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
  reachable (unsecured IP cams, scanner indexes).

## Decisions made while autonomous

_None yet._

## Phases

- [x] 0 Setup
- [ ] 1 Data layer
- [ ] 2 Image proxy
- [ ] 3 API
- [ ] 4 UI shell
- [ ] 5 Map
- [ ] 6 Camera viewer and wall
- [ ] 7 Security review
- [ ] 8 Performance and polish
- [ ] 9 Road condition data collection
- [ ] 10 Road condition model
- [ ] 11 Ship it
