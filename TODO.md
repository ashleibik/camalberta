# TODO (needs a human)

Things that need your accounts, secrets, or a decision. Code tasks live in the
phase plan in `CLAUDE.md`.

- [ ] **Production database.** Create a Neon or Supabase Postgres database
      and set `DATABASE_URL` in Vercel (Phase 11).
- [ ] **CRON_SECRET.** Generate one (see `.env.example`) and add it to Vercel
      env vars (Phase 1 / 11).
- [ ] **511 Alberta developer key.** Register at
      https://511.alberta.ca/developers and request a key, then set
      `ALBERTA_511_API_KEY`. Without it, the provincial highway cameras
      (Trans-Canada through the Bow Valley, and the Edmonton-area highways) are
      skipped. The 511 adapter is built to the documented schema; once the key
      is set, run a sync and spot-check that real cameras match what the
      adapter expects.
- [ ] **Vercel project.** Link the GitHub repo to Vercel (Phase 11).
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
