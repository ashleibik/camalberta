# TODO (needs a human)

Things that need your accounts, secrets, or a decision. Code tasks live in the
phase plan in `CLAUDE.md`.

- [ ] **Production database.** Create a Neon or Supabase Postgres database
      and set `DATABASE_URL` in Vercel (Phase 11).
- [ ] **CRON_SECRET.** Generate one (see `.env.example`) and add it to Vercel
      env vars (Phase 1 / 11).
- [ ] **511 Alberta developer key.** Register at
      https://511.alberta.ca/developers and request a key, then set
      `ALBERTA_511_API_KEY`. Without it, Bow Valley / Banff highway cameras are
      skipped and only Calgary cameras sync. The 511 adapter is built to the
      documented schema; once the key is set, run a sync and spot-check that
      real Bow Valley cameras match what the adapter expects.
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
- [ ] **Extra webcams (optional).** For any privately run camera beyond the
      City of Calgary and 511 Alberta (ski hills, tourism boards, businesses),
      confirm it is openly published for reuse or get written permission
      before we add an adapter.
