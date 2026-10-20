# Security review (Phase 7)

- **Date:** 2026-10-12
- **Scope:** everything in `src/`, `next.config.ts`, the dependency tree, and
  the CI/GitHub configuration. The review covers the app as of commit
  `0f07307` plus the Phase 7 changes listed below.
- **Method:**
  1. Checked each rule from the project brief against the code.
  2. Searched the code for dangerous patterns.
  3. Ran the unit tests, and wrote new ones for every fix.
  4. Ran a live probe (39 checks) against a production build
     (`next build && next start`).
  5. Drove a headless browser through the app on that build.
  6. Ran `npm audit`.

## Result

**All 10 security rules are in place, and all checks pass.** The review found
13 problems. All were fixed, and each fix has a test (see
[Findings and fixes](#findings-and-fixes)). A few risks are accepted on
purpose; each one is explained in [Accepted risks](#accepted-risks).

| Check                                          | Result                                     |
| ---------------------------------------------- | ------------------------------------------ |
| Unit tests (`npm run test`)                    | 120 passed (15 files)                      |
| Lint, typecheck, format (`npm run check`)      | clean                                      |
| Production build                               | clean (one known PGlite trace warning)     |
| Live probe against the production build        | 39 / 39 passed                             |
| Browser run on the production build            | photos, live video, wall, refresh all work |
| `npm audit --omit=dev` (what ships)            | **0 vulnerabilities**                      |
| `npm audit` (including dev tools)              | 9 high, 4 moderate, all dev-only (below)   |
| `innerHTML` / `dangerouslySetInnerHTML` / eval | none                                       |

## The security rules

| #   | Rule                                                                           | Status | Where it's enforced                                                                                                                                                                                                                                                                                                                                                                                                                 | Verified by                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **No open proxy.** Only cameras in our DB, by our own id; never a client URL.  | ✅     | Proxies look cameras up by id ([image route](src/app/api/cam/[id]/image/route.ts), [live](src/app/api/cam/[id]/live/route.ts), [segments](src/app/api/cam/[id]/live/[segment]/route.ts)). Every upstream request goes through [`fetchUpstream`](src/lib/proxy/upstream.ts): https only, the source's allowlisted host only, redirects re-checked. API responses never include upstream URLs ([serialize.ts](src/lib/serialize.ts)). | Tests: [upstream.test.ts](src/lib/proxy/upstream.test.ts), [image.test.ts](src/lib/proxy/image.test.ts), [hls.test.ts](src/lib/proxy/hls.test.ts). Probe: URL-as-id, URL-in-query and metadata-IP attempts → 400; no upstream host in any response. |
| 2   | **Validate all input** with Zod; bad input → 400.                              | ✅     | Ids: [`cameraIdSchema`](src/lib/camera-id.ts). Query strings: [`parseQuery`](src/lib/http.ts) on every route (strict: unknown or repeated parameters → 400). Segment names: regex schema. Malformed percent-encoding: [`src/proxy.ts`](src/proxy.ts). No route reads a request body. Client: wall URL (Zod), `?cam=` and stored favorites are validated too.                                                                        | [http.test.ts](src/lib/http.test.ts); probe: 17 malformed-input cases, all 400/404 as intended.                                                                                                                                                     |
| 3   | **Validate upstream data** with Zod before the DB.                             | ✅     | Zod schemas for [Calgary](src/lib/sources/calgary.ts), [511](src/lib/sources/alberta511.ts) and [Edmonton](src/lib/sources/edmonton.ts) (per record). Banff and Sunshine are curated lists in code. Feeds are size-capped and never follow redirects ([feed.ts](src/lib/sources/feed.ts)). Images: jpeg/png only, 64 B-3 MB. Video: strict playlist parser, MPEG-TS check, 2 MB cap.                                                | Adapter tests against saved real responses; [feed.test.ts](src/lib/sources/feed.test.ts); hls tests (foreign URIs, encryption, master playlists rejected).                                                                                          |
| 4   | **No unsafe HTML.** Names render as text only.                                 | ✅     | React text rendering everywhere; map tooltips use `setText` ([map-view.tsx](src/components/app/map/map-view.tsx)). ESLint errors on `dangerouslySetInnerHTML`, `innerHTML`/`outerHTML` assignment, `insertAdjacentHTML`, `eval`, `new Function` ([eslint.config.mjs](eslint.config.mjs)). Upstream SVG is never served (jpeg/png only).                                                                                             | Search below; `npm run lint` clean.                                                                                                                                                                                                                 |
| 5   | **Rate limiting** on every `/api` route, stricter on the image proxy.          | ✅     | [`rate-limit.ts`](src/lib/rate-limit.ts), called first in every route. JSON routes and sync: 60/min. Image proxy: 30/min **per camera** plus 200/min overall. Video: 120/min per stream plus 1,200/min overall.                                                                                                                                                                                                                     | [rate-limit.test.ts](src/lib/rate-limit.test.ts); probe: 429 + `Retry-After` exactly at request 61 (API, sync) and 31 (one camera); spoofed `X-Forwarded-For` doesn't reset it.                                                                     |
| 6   | **Security headers** (CSP own origin + map tiles, HSTS, XFO, nosniff, RP, PP). | ✅     | [`next.config.ts`](next.config.ts) on every path. Also COOP and (new) CORP `same-origin`. Production CSP has no `unsafe-eval`; the only third-party origin is `https://tiles.openfreemap.org`.                                                                                                                                                                                                                                      | Probe: all headers on `/`, `/wall`, JSON, image and error responses.                                                                                                                                                                                |
| 7   | **Secrets** only in env vars; `.env` ignored; only `.env.example` committed.   | ✅     | [`.gitignore`](.gitignore) ignores `.env*` except `.env.example`; `.env` has never been committed (`git log --all -- .env` is empty). Env is validated in [`env.ts`](src/lib/env.ts) (server-only, no `NEXT_PUBLIC_` variables). Error messages and logs never include the 511 key (it travels in a query string).                                                                                                                  | `git ls-files`, history check, [feed.test.ts](src/lib/sources/feed.test.ts).                                                                                                                                                                        |
| 8   | **Protected routes** check `CRON_SECRET` with a timing-safe compare.           | ✅     | [`auth.ts`](src/lib/auth.ts): SHA-256 both sides, then `timingSafeEqual` (no length leak); fails closed when unset; secret must be 32+ chars. `/api/sync` (GET for Vercel Cron, POST manual).                                                                                                                                                                                                                                       | [auth.test.ts](src/lib/auth.test.ts); probe: missing, wrong, extended, non-Bearer and Basic credentials → 401.                                                                                                                                      |
| 9   | **Errors** never leak stack traces or internal URLs.                           | ✅     | Routes return short fixed messages. Sync failures become safe categories ([`describeSyncError`](src/lib/sources/feed.ts)); details only reach the server log (name and message, no URLs). Next.js production errors have no stack.                                                                                                                                                                                                  | Probe scans every response for stack frames, file paths, upstream hosts and secret names.                                                                                                                                                           |
| 10  | **Dependencies:** `npm audit` each phase; fix high and critical.               | ✅\*   | Production dependencies: 0 vulnerabilities. Dependabot (weekly, 7-day cooldown) and CI (`npm audit --omit=dev --audit-level=high`) keep it that way. \*Dev-only findings with no available fix are accepted below.                                                                                                                                                                                                                  | `npm audit`, [ci.yml](.github/workflows/ci.yml).                                                                                                                                                                                                    |

Related hard rules from the brief:

- **The browser never calls upstream.** CSP `connect-src`, `img-src` and
  `media-src` allow only our origin (plus map tiles); all camera traffic goes
  through our proxies.
- **TypeScript strict, no `any`.** The ESLint rule is an error; the code has no
  `any`, `@ts-ignore` or `@ts-expect-error`. The three `eslint-disable` lines
  each give a reason.
- **Attribution.** The footer and README keep the exact required sentence, and
  the other camera owners are credited after it.

## Search for dangerous patterns

Searched `src/`, config and scripts (excluding `node_modules`, `.next` and the
copied MapLibre worker):

| Pattern                                                                                     | Found                               |
| ------------------------------------------------------------------------------------------- | ----------------------------------- |
| `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` | none (only in the ESLint rule text) |
| `eval(`, `new Function`, `srcDoc`, `javascript:` URLs                                       | none                                |
| `any`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`                                      | none                                |
| `process.env` outside `env.ts`; `NEXT_PUBLIC_*`                                             | none                                |
| Request input (params, query, body, `location.search`, `localStorage`)                      | all validated (rule 2)              |

## Findings and fixes

Severity reflects this app's exposure, from High (exploitable in our
deployment) to Info (defense in depth).

| #   | Severity | Finding                                                                                                                                                                                          | Fix                                                                                                                                                                                                                                                      | Test                                                                     |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | Medium   | **Redirects could take the image proxy anywhere.** It followed upstream redirects automatically, so a misbehaving or compromised camera host could send our server to internal addresses (SSRF). | [`fetchUpstream`](src/lib/proxy/upstream.ts) follows at most 3 redirects by hand and re-checks each target against the source's host allowlist. The video relay uses it too.                                                                             | upstream.test.ts: cross-host, metadata-IP, lookalike-host and loop cases |
| 2   | Medium   | **Rate limits could be bypassed.** The client IP was the _first_ `X-Forwarded-For` entry, which the client controls, so changing it gave a fresh bucket on every request.                        | [`clientIp`](src/lib/rate-limit.ts) uses `X-Real-IP`, then the _last_ `X-Forwarded-For` hop (the one our proxy adds). Vercel overwrites both.                                                                                                            | rate-limit.test.ts; probe "spoofed X-Forwarded-For" check                |
| 3   | Medium   | **A flood of distinct keys made the limiter slow.** Once it held 10,000 keys, every request scanned the whole map: 60,000 keys took 52 s (CPU denial of service).                                | Sweeps run at most every 10 s; a hard cap of 50,000 keys evicts the oldest down to 40,000.                                                                                                                                                               | rate-limit.test.ts: 200,000 keys in under 3 s, map stays bounded         |
| 4   | Low      | **`/api/sync` wasn't rate limited**, breaking "every `/api` route" and allowing fast guessing of the secret.                                                                                     | 60/min per IP, checked before the secret.                                                                                                                                                                                                                | probe: 429 at request 61                                                 |
| 5   | Low      | **Bad URL encoding gave 500, not 400.** A path like `/api/cameras/%E0%A4%A` crashed param decoding inside Next.js.                                                                               | [`src/proxy.ts`](src/proxy.ts) rejects badly encoded `/api` paths with a 400 before routing.                                                                                                                                                             | probe "malformed percent-encoding" (was 500, now 400)                    |
| 6   | Low      | **Unexpected query parameters were ignored** instead of rejected, and they could also bust the CDN cache.                                                                                        | [`parseQuery`](src/lib/http.ts) with strict schemas on every route; repeated keys rejected too.                                                                                                                                                          | http.test.ts; probe (6 cases)                                            |
| 7   | Low      | **Upstream bodies were fully buffered before the size check**, and the caps were 10 MB (images) and 8 MB (segments), so a misbehaving upstream could exhaust memory.                             | [`readBodyLimited`](src/lib/proxy/upstream.ts) streams and stops at the cap. Caps are now 3 MB (photos; largest real one ~0.8 MB), 2 MB (segments; real ~160 KB), 64 KB (playlists) and 5 MB (camera feeds).                                             | upstream.test.ts (endless stream), image.test.ts (>3 MB)                 |
| 8   | Low      | **Calgary photos were fetched over plain http** (the open data lists `http://` URLs), so they could be tampered with in transit.                                                                 | Every upstream camera request is upgraded to https (all our camera hosts serve it).                                                                                                                                                                      | upstream.test.ts                                                         |
| 9   | Low      | **Sync results returned raw error messages**, which could carry validation details or upstream text.                                                                                             | [`describeSyncError`](src/lib/sources/feed.ts) returns safe categories. Full details go to the server log only, as name and message without URLs (the 511 key is in a query string).                                                                     | feed.test.ts                                                             |
| 10  | Low      | **The image proxy wasn't "stricter".** Its single 200/min limit was higher than the 60/min API limit.                                                                                            | Added per-camera limits (30/min for photos, 120/min per video stream) on top of the overall limits. Lowered the overall video limit from 2,400 to 1,200/min. Live playlists can be served by a CDN for 1 s, so crowds behind one IP don't hit the limit. | probe: 429 at request 31 for one camera                                  |
| 11  | Low      | **Other websites could hotlink our proxy.** They could embed our proxied photos and video (`<img>`/`<video>` on another site) and spend our bandwidth.                                           | `Cross-Origin-Resource-Policy: same-origin` on every response.                                                                                                                                                                                           | probe: header present                                                    |
| 12  | Info     | **Camera feed fetches followed redirects.**                                                                                                                                                      | They now refuse them (`redirect: "error"`), so a moved feed fails loudly instead.                                                                                                                                                                        | feed.test.ts                                                             |
| 13  | Info     | **Two browser inputs weren't validated:** the `?cam=` URL parameter and the stored favorites.                                                                                                    | Both are checked against `cameraIdSchema`; favorites are capped at 1,000.                                                                                                                                                                                | covered by the schema's tests                                            |

Added in this phase:

- [`SECURITY.md`](SECURITY.md): how to report a vulnerability (GitHub private
  reporting), scope and safe harbor.
- [`.github/dependabot.yml`](.github/dependabot.yml): weekly npm and Actions
  updates, with a 7-day cooldown to match our supply-chain rule.
- [`.github/workflows/codeql.yml`](.github/workflows/codeql.yml): CodeQL
  `security-extended` for TypeScript and for the workflows. It runs on pushes,
  pull requests and weekly.
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml): lint, typecheck,
  format, tests and the production audit on every push and pull request.
  Actions are pinned to full commit SHAs, and each pinned release is at least
  7 days old.

## Accepted risks

- **CSP `script-src 'unsafe-inline'`.** Next.js injects inline bootstrap
  scripts, and nonce-based CSP needs fully dynamic rendering, which conflicts
  with `cacheComponents`/PPR. Mitigation: no HTML from data is ever rendered
  (rule 4, lint-enforced). `style-src 'unsafe-inline'` is needed for
  framework and map inline styles. The `next-themes` inline script is static
  library code.
- **Dev-only audit findings.**
  - `braces` (high, GHSA-vfj7-8cjw-p6xm): stack exhaustion from deeply nested
    glob patterns. No fixed version exists (3.0.3 is the latest and is
    affected). It is reached only through `eslint-config-next` and the
    `shadcn` CLI, which run with our own fixed patterns, and none of it ships.
    npm's suggested "fix" downgrades eslint-config-next to v14.
  - `esbuild` (moderate) inside `drizzle-kit`: affects esbuild's dev server,
    which drizzle-kit doesn't run.
  - Dependabot will propose updates when fixes appear.
- **In-memory rate limiter.** Each server instance counts separately, so on
  multi-instance serverless it's a floor, not a global cap. The upstream
  camera hosts are protected separately by the proxies' single-flight caches.
  A shared store is in [TODO.md](TODO.md).
- **Client IP trust.** The limiter needs a reverse proxy that sets
  `X-Real-IP` or appends `X-Forwarded-For`. Vercel does this. A server exposed
  directly to the internet without one would trust client-sent headers.
- **Looser limits in local development.** With `NODE_ENV=development` the
  limits are scaled ×20, because locally every tab shares one "unknown" client
  bucket and normal browsing tripped them. Production builds (where the live
  probe ran) use the limits exactly as listed.
- **Public CDN caching of camera data.** Photos (until the next photo), video
  segments (30 s), playlists (1 s) and the camera list (5 min) may be cached
  by shared caches. All of it is public data.
- **Third-party camera permissions.** Banff Sunshine Village ("All Rights
  Reserved"), the Edmonton video relay and the Town of Banff need written OK
  before a public launch ([TODO.md](TODO.md)). This is a legal and courtesy
  issue, not a code vulnerability.

## Follow-ups for later phases

- **Phase 8:** ~~add header and input-validation assertions to the
  Playwright smoke tests so regressions fail CI.~~ Done:
  `e2e/security.spec.ts` (runs in CI).
- **Phase 9:** `/admin/label` must use `isAuthorized` (or a real session), be
  rate limited, and validate every label write with Zod. If it uses cookies,
  add CSRF protection.
- **Phase 11:**
  - Enable GitHub private vulnerability reporting.
  - Set `CRON_SECRET` in Vercel.
  - Re-run the probe against the live URL.
  - Consider a shared rate-limit store.

## Addendum: Phase 6B (Trip Check), 2026-10-19

Trip Check added the first routes that read a request body, the first
client-supplied URL our server sends requests to (push subscription
endpoints), and a service worker. Each was built to the rules above and
probed against the dev server (19/19 passed).

| Surface                                   | Control                                                                                                                                                                      | Probe result                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET /api/trips/[trip]`                   | Rate limited; trip id is a Zod enum; `noQuery`; served from our DB only (511 is never called per request)                                                                    | Unknown trip 400, extra param 400, valid 200                                                         |
| `POST /api/push/subscribe`, `unsubscribe` | `parseJsonBody`: same-origin only (`Sec-Fetch-Site`, `Origin` vs `Host`), `application/json` only, 4 KB streaming cap, strict Zod; push limit 10/min/IP; 20,000-row ceiling  | Cross-site 403, foreign Origin 403, text/plain 415, 5 KB 413, bad JSON 400, extra field 400, GET 405 |
| Push endpoints (SSRF)                     | `isAllowedPushEndpoint`: https, no port or credentials, FCM / Mozilla / Apple / WNS hosts only; checked at subscribe and again before each send                              | Metadata IP 400, http FCM 400, lookalike host 400; unit tests cover more                             |
| `POST /api/push/test`                     | `isAuthorized` (CRON_SECRET, timing-safe, fails closed); strict query                                                                                                        | No secret 401, wrong secret 401, bad trip 400                                                        |
| Stored data                               | Only endpoint, keys, trip, baseline verdict, last-sent time. No IP, user agent or email. Endpoints never logged.                                                             | Reviewed in code                                                                                     |
| Dead subscriptions                        | Deleted when the push service answers 400/401/403/404/410                                                                                                                    | Verified live (FCM 410 removed the row)                                                              |
| `public/sw.js`                            | Shows notifications only (no caching, no fetches). Payload treated as untrusted: text only, lengths capped, opens same-origin paths only. Served with the CSP and `nosniff`. | Headers checked; push delivered and shown in Chrome                                                  |
| 511 rate limit                            | One shared 60 s window per sync across instances (atomic upsert), 4 calls per window                                                                                         | Second sync within a minute skipped 511                                                              |
| Upstream 511 data                         | Each record validated with Zod; feeds that are mostly invalid fail; descriptions rendered as text only                                                                       | Unit tests on saved real responses                                                                   |

Accepted: anyone who knows a subscription's endpoint URL can unsubscribe it.
Endpoints are long random capability URLs known only to that browser and us,
and unsubscribing is harmless.

## Addendum: Phase 8 (performance), 2026-10-19

- `/api/push/key` was removed: the VAPID public key (public by design) is now
  passed to the Trip Check page by the server. One less route.
- New input: the `camalberta_wall` cookie (Path=/wall, SameSite=Lax, Secure on
  https). It's untrusted and goes through the same strict parser as the wall
  URL (`parseWallParams`: grid 1 to 4, at most 16 well-formed camera ids,
  4 KB cap, bad percent-encoding rejected); unit tested. It carries no
  identity and authorizes nothing.
- The browser no longer bundles Zod for URL and localStorage checks; plain
  guards share the server schemas' patterns, and a test asserts they agree.
- Zod's `jitless` mode removed the CSP violation its eval probe caused (the
  CSP itself is unchanged and still blocks eval).
- `e2e/security.spec.ts`: security headers on every page, 4xx for bad input
  on every API, protected routes fail closed, push subscribe refuses
  cross-site, non-JSON and non-push-service endpoints.

## Addendum: Phase 9 (road condition collection), 2026-10-19

Phase 9 added the first admin pages, a write path into object storage, an
image decoder (sharp / libvips) running on upstream bytes, and a scheduled
job outside Vercel. Probed against the dev server; the auth, input and cookie
checks are now in `e2e/admin.spec.ts` and `e2e/security.spec.ts`.

| Surface                           | Control                                                                                                                                                                                                                                                                     | Probe result                                                                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/*` (proxy)                | Rate limited (300/min/IP), then HTTP Basic with `CRON_SECRET` as the password (timing-safe, fails closed when unset). 401 with `WWW-Authenticate` and `no-store`. Each page, route and action checks again.                                                                 | No login 401, wrong password 401, Bearer secret accepted                                                                                                |
| `/admin/label` page               | `robots: noindex`; query parsed to known values (unknown values fall back); keyset paging on a numeric id                                                                                                                                                                   | `?show=everything&auto=ice&before=1;drop` falls back to the default view (unit test)                                                                    |
| `saveLabel` server action         | Next's server-action Origin check; then rate limit, admin login, `z.strictObject` (`id` positive int, `label` enum or null)                                                                                                                                                 | Label "ice" / extra field / string id / negative id: "Invalid label."; unknown id: "Snapshot not found."; foreign Origin rejected by Next; no login 401 |
| `GET /admin/snapshots/[id]/image` | Admin login; id `^\d{1,15}$`; `noQuery`; the storage key comes from our DB row, never the request; `Cache-Control: private`                                                                                                                                                 | `abc` 400, extra query 400, unknown id 404                                                                                                              |
| Storage keys (path traversal)     | Keys are built only by `snapshotKey` and must match `snapshots/<source>_<id>/yyyy/mm/dd/hhmmss-<hash>.jpg`; the local store also checks the resolved path stays inside its folder                                                                                           | `../../etc/passwd`, absolute and suffix tricks rejected (unit tests)                                                                                    |
| R2 (S3) requests                  | SigV4 via `aws4fetch`, path-style, 15 s timeout; the body's SHA-256 is signed (not `UNSIGNED-PAYLOAD`); GET capped at 2 MB with `readBodyLimited`; errors carry the status only (no bucket URL). Token scoped to one bucket, Object Read & Write.                           | Signed headers and error text checked with a mocked fetch (unit tests)                                                                                  |
| sharp on upstream bytes           | Inputs are already https-only, allowlisted, 3 MB capped and JPEG/PNG typed (`fetchCameraImage`). `limitInputPixels` 25 M stops decompression bombs; `failOn: "error"` rejects corrupt files. A failed thumbnail falls back to the original photo.                           | 5100x5000 PNG (under 200 KB) rejected; HTML bytes rejected (unit tests)                                                                                 |
| `?w=320` thumbnails               | `w` is `z.literal("320")`: one size only, so nobody can make us resize to arbitrary sizes; one resize per camera per new photo (cache keyed on the cached original); 1,000-entry cap                                                                                        | `w=640` 400; repeat requests reuse one resize (unit test)                                                                                               |
| `/api/collect`                    | Same as `/api/sync`: rate limited, `CRON_SECRET` (fails closed), `noQuery`; errors return a generic message                                                                                                                                                                 | No secret 401                                                                                                                                           |
| GitHub Actions workflow           | Triggers: `schedule` and `workflow_dispatch` only (no pull request runs, so forks never see secrets); `permissions: contents: read`; actions pinned to commit SHAs; `persist-credentials: false`; one run at a time; logs print counts only (no URLs or connection strings) | Reviewed                                                                                                                                                |
| Wall cookie (tightened)           | Now always `Secure`, `SameSite=Lax`, `Path=/wall`; written only when 2,048 characters or less; the server validates it with Zod (length and charset) before the wall schema                                                                                                 | Browser stores it with those attributes; server renders the cookie's wall; a 3,000-character cookie is ignored (e2e)                                    |

**Bug found and fixed while probing:** the Zod check first written for the
wall cookie expected the stored (percent-encoded) form, but Next's
`cookies()` decodes each value once, so every real cookie failed the check
and the server silently fell back to the default wall. The unit tests had
passed the encoded form directly. They now model the decoding, and an e2e
test exercises the real browser to server path.

**Privacy.** Snapshots are frames from public traffic cameras, resized to
512 px and visible only on the admin page. Nothing identifies people (Hard
rule 2): there's no face or plate detection, and the labels describe only the
road surface.

## Addendum: admin hardening, 2026-10-20

Done before the first deployment, at the owner's request. It supersedes the
`/admin` rows of the Phase 9 table, where `CRON_SECRET` was the admin
password.

| Surface                 | Control                                                                                                                                                                                                                                                                           | Probe result (production build)                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Admin login             | HTTP Basic with `ADMIN_USERNAME` + `ADMIN_PASSWORD` (16+ chars, must differ from `CRON_SECRET`). Both compared with `timingSafeEqual` on SHA-256 digests, always both. `CRON_SECRET` is no longer accepted in any form.                                                           | Right login 200; wrong user or password 401; `Bearer <CRON_SECRET>` and `CRON_SECRET` as the password 401 (unit + e2e)                                                         |
| Lockout                 | 5 failures in 15 min lock the address for 15 min; IPv6 by /64. Checked before the credentials, so guessing stops during a lockout. Stored in Postgres (atomic upsert), shared by every instance and kept across cold starts. Store errors give 503 (fail closed).                 | 4 x 401, then 429 with `Retry-After: 900`; right password from that address 429; other addresses 200; a success clears earlier failures; row present in `admin_login_failures` |
| Logging                 | Each failure: IP and count. Each lockout: key and until when. Never credentials. The IP is sanitized for logs.                                                                                                                                                                    | Log lines checked; unit test asserts no credential text                                                                                                                        |
| `ADMIN_ENABLED`         | In production, `/admin` is rewritten to the normal not-found page unless it's `true`: same 404 status, page and headers as a missing path. Pages, the image route and the action re-check it. Config refuses `true` without a login.                                              | `/admin`, `/admin/label`, the image route (even with the right login): 404 identical to `/does-not-exist`; server-action POST 400, as on a missing page                        |
| Prerendering            | The page's env check runs after `await headers()`. Before it, it ran at build time and baked a 404 into a static page (caught by the build output: ○ instead of ◐).                                                                                                               | Build shows `/admin/label` as ◐                                                                                                                                                |
| Indexing                | `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store` on every admin response; `<meta name="robots" content="noindex, nofollow">`; `robots.txt` disallows `/admin` and `/api/`                                                                                          | Headers, meta tag and robots.txt checked (e2e + production)                                                                                                                    |
| Workflows (public repo) | No `pull_request_target` or `workflow_run`. CI and CodeQL: `pull_request`, read-only permissions, no secrets. Collector: `schedule` and `workflow_dispatch` only, secrets scoped to the steps that use them (not `npm ci`), actions pinned to SHAs, `persist-credentials: false`. | Reviewed                                                                                                                                                                       |
| Repository contents     | `.env*` (except the example), `/.data/`, `/snapshots/`, `*.pem`, `*.key`, `*.p12`, `*.pfx` ignored. History scan (17 commits): no `.env` value, no key files, and no private key, AWS, GitHub, Slack, Stripe, Google, JWT, password-bearing database URL or URL API-key patterns. | Only hit: the deliberate CI throwaway value (`ci-only-throwaway-...`)                                                                                                          |

Accepted: listing `/admin` in `robots.txt` names the path. It's a 404 unless
enabled, and behind a login with lockout when enabled.
