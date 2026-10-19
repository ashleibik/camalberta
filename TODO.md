# TODO (needs a human)

Things that need your accounts, secrets, or a decision. Code tasks live in the
phase plan in `CLAUDE.md`.

- [ ] **Production database.** Create a Neon or Supabase Postgres database
      and set `DATABASE_URL` in Vercel (Phase 11).
- [ ] **CRON_SECRET.** Generate one (see `.env.example`) and add it to Vercel
      env vars (Phase 1 / 11).
- [x] **511 Alberta developer key.** Done 2026-10-19: the key is in your
      local `.env` as `ALBERTA_511_API_KEY`, and all four 511 adapters were
      checked against real responses (saved as fixtures).
- [ ] **511 key in production (Phase 11).** Add `ALBERTA_511_API_KEY` to the
      Vercel env vars. Without it, provincial highway cameras and all of Trip
      Check's road data are skipped. The key was pasted into a chat once; if
      that worries you, request a new one on
      https://511.alberta.ca/developers/doc and update `.env`.
- [ ] **Check Trip Check's winter values after the first snow.** The verdict
      rules (`src/lib/trip/config.ts`) match 511's official vocabulary
      (Partly Covered / Covered, Snow / Ice, Travel Not Recommended) by
      keyword, because the fixtures were saved on a dry October day. When
      there's snow on Highway 1 or the QEII, run a sync and look for
      `[trip] 511 values with no rule` in the server log; add any new values
      to `config.ts` with a comment.
- [ ] **Push alert keys for production (Phase 11).** Your local `.env` has a
      VAPID key pair generated for development. For the deployed app, run
      `npx web-push generate-vapid-keys` and set `VAPID_PUBLIC_KEY` and
      `VAPID_PRIVATE_KEY` in Vercel. Changing keys later invalidates every
      existing alert subscription (they're deleted on the next delivery).
- [ ] **Push contact (`VAPID_SUBJECT`).** Push services can use this to
      contact whoever runs the app. Locally it's the placeholder
      `mailto:admin@example.com`; set a real `mailto:` address or an `https:`
      page you control before deploying.
- [ ] **Sync every 15 minutes in production (Phase 11).** Trip Check shows
      "Data may be out of date" (and never green) when the last 511 sync is
      over 30 minutes old. `vercel.json` asks for a cron every 15 minutes;
      check the Vercel plan allows that (some plans only run cron jobs once a
      day), or use another scheduler to call `/api/sync`.
- [ ] **(Phase 11) `/api/health` on Postgres.** Found during Phase 6B, not
      fixed (outside its scope): `getHealth` in `src/lib/queries.ts` reads
      `result.rows` from `db.execute`, which is right for PGlite, but the
      postgres.js driver returns the rows array itself. With `DATABASE_URL`
      set, `/api/health` (and the status bar's "cameras online") would fail.
      Fix: use `Array.isArray(result) ? result : result.rows`, or rewrite the
      query with the Drizzle query builder.
- [ ] **Vercel project.** Link the GitHub repo to Vercel (Phase 11).
- [ ] Rename the GitHub repo to camalberta in repo Settings (GitHub redirects
      the old URL automatically).
- [ ] **(Optional) Local folder.** The project folder on this PC still has
      the old name. To rename it to `camalberta`, close VS Code and any running
      dev server first, then reopen the renamed folder.
- [ ] **GitHub security settings** (once the repo is on GitHub): turn on
      _Private vulnerability reporting_ (Settings → Code security), which
      `SECURITY.md` points people to, plus Dependabot alerts and code scanning
      so the CodeQL workflow's results show up.
- [ ] **(Self-hosting only) Reverse proxy.** On Vercel nothing is needed. If
      the app is ever run with `next start` on its own server, put it behind a
      proxy (nginx, Caddy) that sets `X-Real-IP`, or rate limits can be
      dodged by sending fake IP headers.
- [ ] **(Scaling) Shared rate-limit store.** The rate limiter in
      `src/lib/rate-limit.ts` is in-memory, so on multi-instance serverless each
      instance counts separately. For a strict global limit, back it with
      Upstash Redis (or similar) and set its env vars. Fine as-is for a single
      instance and for the demo.
- [ ] **(Phase 11) PGlite build-trace warning.** `next build` warns that
      `/api/sync` does "dynamic filesystem access" (PGlite's data dir). It's
      harmless locally, but in production you'll set `DATABASE_URL` so PGlite
      isn't used; consider lazy-importing the PGlite driver so it stays out of
      the serverless function trace.
- [ ] **Permission before a public launch (Phase 11).** Fine for the class
      demo, but before the app is public, get these in writing:
  - **Banff Sunshine Village** webcams: their site says "All Rights
    Reserved". Ask the resort if a non-commercial school app may show them
    (with credit and a link back), or remove the `sunshine` adapter.
  - **City of Edmonton** live video: their Conditions of Use allow
    educational, non-commercial use with the copyright notice, but their
    streaming server only lets the City's own site play the streams, and we
    relay them through our server. Email the City (311 or Traffic
    Operations) to confirm that's OK.
  - **Town of Banff** cameras: the site's copyright page didn't load, so the
    terms are unknown. A short email to the Town to confirm.
- [ ] **New webcams.** For any other camera (ski hills, tourism boards,
      businesses), confirm the owner openly publishes it for reuse or get
      written permission before we add an adapter. Never add cameras that
      are merely reachable (see the "Private" decision in `CLAUDE.md`).
