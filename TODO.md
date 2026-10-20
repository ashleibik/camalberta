# TODO (needs a human)

Things that need your accounts, secrets, or a decision. Code tasks live in the
phase plan in `CLAUDE.md`.

## Start road condition collection in production (Phase 9)

Do these in order; about 30 to 45 minutes. Everything here is on a free plan.
Until steps 6 and 7 are done, the scheduled workflow does nothing (it skips
each step whose settings are missing), so it won't email you failures.

- [ ] **1. Put the repo on GitHub, public.** GitHub Actions is free and
      unlimited on public repositories. A private repo gets 2,000 minutes a
      month, and this schedule needs about 2,900: 96 runs a day, each billed
      as at least one minute.
  - On github.com, create an empty **public** repository named `camalberta`
    (no README, licence or .gitignore; we have them).
  - Then, in this folder:
    `git remote add origin https://github.com/<your-username>/camalberta.git`
    and `git push -u origin master`.
  - Scheduled workflows only run on the default branch. That's `master` if
    it's the first branch you push; check under Settings → General.
  - Safe to publish (checked 2026-10-20, before "Harden admin auth"):
    - `.env`, `.data/` and key files are ignored and were never committed.
    - No value from `.env` appears in any of the 17 commits or any project
      file.
    - A pattern scan of every commit for private keys, cloud and GitHub
      tokens, database URLs with passwords and API keys in URLs found only
      the deliberate throwaway CI test value.
    - Check again (`git log -p | grep`) if you ever paste a key somewhere.
- [ ] **2. Database: Supabase (free).**
  - Why not Neon: its free plan caps compute at 100 CU-hours a month, and a
    job every 15 minutes keeps it awake roughly 40 to 50% of the time.
    Supabase's free plan has no compute cap. It only pauses after a week with
    no activity, which this schedule prevents.
  - Create a project at https://supabase.com (region: Canada (Central) if
    offered, else US West) and save the database password.
  - Click **Connect** and copy two connection strings, putting in your
    password:
    - **Transaction pooler** (port 6543): this is `DATABASE_URL` for Vercel
      and GitHub.
    - **Session pooler** (port 5432): for migrations only.
  - Don't use the direct connection: it's IPv6 only, and GitHub's runners
    can't reach it.
  - Create the tables once from this folder, in PowerShell:
    `$env:DATABASE_URL="<session pooler string>"; npm run db:migrate; Remove-Item Env:DATABASE_URL`
    It should print "Migrations applied to Postgres."
- [ ] **3. Snapshot bucket: Cloudflare R2 (free tier).**
  - In the Cloudflare dashboard, open **R2 Object Storage**. The first time,
    Cloudflare asks for a payment method (card or PayPal) to turn R2 on.
    Usage within the free tier costs $0. Adding a billing notification is
    worthwhile.
  - **Create bucket**: name `camalberta-snapshots`, location Automatic,
    storage class **Standard** (the free tier covers Standard only). Leave
    public access **off**: snapshots are only served through the admin page.
  - **R2 → Manage API tokens → Create API token**: permission **Object Read
    & Write**, **Apply to specific buckets only** → `camalberta-snapshots`.
    Copy the **Access Key ID**, the **Secret Access Key** (shown once) and
    the S3 endpoint `https://<account id>.r2.cloudflarestorage.com`.
- [ ] **4. Secrets and the admin login.** Generate each with
      `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`:
  - `CRON_SECRET`: for the machine routes (sync, collect). The same value
    goes in Vercel and GitHub.
  - `ADMIN_PASSWORD`: a different value (16+ characters; the app refuses to
    start if it equals `CRON_SECRET`). Keep it in your password manager.
  - `ADMIN_USERNAME`: pick one (letters, digits, `. _ @ -`; no colon).
    Not `admin`.
- [ ] **5. Vercel (the app).** Import the GitHub repo at https://vercel.com
      (Hobby plan), and set these environment variables (Production):
  - `DATABASE_URL`: the transaction pooler string.
  - `CRON_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
  - `ALBERTA_511_API_KEY`: from your `.env`.
  - `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`:
    so the label page can show the stored photos.
  - Optional: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (see
    below).
  - **Don't** set `ADMIN_ENABLED` yet: without it, `/admin` is a 404.

  Deploy, and note the URL (`https://<project>.vercel.app`). `vercel.json`
  only has a daily cron (the Hobby limit) as a backstop; the 15-minute sync
  comes from step 6.

- [ ] **6. GitHub settings.**
  - **Settings → Secrets and variables → Actions → Secrets:**
    `CRON_SECRET`, `DATABASE_URL` (transaction pooler), `S3_ENDPOINT`,
    `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. The admin login
    is not needed here.
  - **Variables** tab: `APP_URL` = your Vercel URL, no trailing slash.
  - **Settings → Actions → General → "Approval for running fork pull
    request workflows from contributors":** choose **Require approval for
    all external contributors**.
    - Our workflows never give secrets to forks, but this also stops
      strangers' pull requests from using your Actions minutes.
    - In the same section, keep **Workflow permissions** at **Read
      repository contents** (the default for new repos).
- [ ] **7. First run, by hand.** Go to **Actions → Collect → Run workflow**.
  - The sync step should print something like
    `{"trip":"ok","alerts":...,"ms":...}`.
  - The collect step should print JSON with `"storage":"s3"` and `"saved"`
    around 30. A few cameras are always `stale`: frozen at the source.
  - The R2 bucket should have objects under `snapshots/`.
  - From then on it runs at :07, :22, :37 and :52 past every hour.
- [ ] **Labelling sessions** (whenever you want to label):
  - Set `ADMIN_ENABLED=true` in Vercel and redeploy (Deployments → ⋯ →
    Redeploy; variable changes only apply to new deployments).
  - Open `<APP_URL>/admin/label` and sign in with `ADMIN_USERNAME` /
    `ADMIN_PASSWORD`.
  - When done, delete `ADMIN_ENABLED` (or set it to `false`) and redeploy.
    `/admin` is then a 404 again.
  - Five wrong passwords lock your address out for 15 minutes. To clear
    it sooner, delete its row from `admin_login_failures` in Supabase's
    table editor.
- [ ] **8. Keep it running.**
  - **Inactivity:** GitHub turns off schedules in public repos after 60
    days without a commit. It emails you first; click **Enable workflow**
    or push anything.
  - **Gaps:** scheduled runs can start 5 to 30 minutes late, or be skipped
    when GitHub is busy. That only leaves gaps in the data.
  - **R2 cost:** storage grows about 2 GB a month. It passes the free 10
    GB-month after about 5 months, then costs about $0.015 per GB-month
    (about $0.21 a month after a year).
  - **Database size:** about 45 MB of rows a month, so Supabase's free 500
    MB lasts about 10 months. Decide on retention or exporting in Phase
    10/11.
- [ ] **First week after launch: check Vercel Usage daily.** Vercel
      dashboard → camalberta → Usage. Watch Fast Data Transfer most of all:
      the free plan includes about 100 GB a month, and Edmonton's live
      video uses roughly 270 MB per viewer-hour. Also watch function
      invocations and Active CPU. Vercel pauses the project when a free
      limit runs out. If one is getting close, turn off the Edmonton video
      relay or move to Pro.

- [ ] **Apply migration 0004 (RLS lockdown) to production.** Supabase's
      Security Advisor flags every table as "RLS Disabled in Public" until it
      runs. In PowerShell, from this folder, using the **session pooler**
      string (port 5432, from Supabase → Connect):
      `$env:DATABASE_URL="<session pooler string>"; npm run db:migrate; Remove-Item Env:DATABASE_URL`
      It prints "Migrations applied to Postgres." No redeploy is needed. Then
      reload the Security Advisor: the 8 CRITICAL findings should be gone. It
      may list "RLS Enabled No Policy" (INFO) instead, which is intended.
      Keep the Data API turned off (Project Settings → Data API).

## Other

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
- [x] **Sync every 15 minutes in production.** Vercel's free plan only
      allows a daily cron, so the GitHub Actions schedule (steps 1 to 7
      above) calls `/api/sync` every 15 minutes. Trip Check needs that: it
      shows "Data may be out of date" (and never green) when the last sync
      is over 30 minutes old.
- [x] **`/api/health` on Postgres.** Fixed 2026-10-20: `getHealth` used
      `db.execute(...).rows`, which only PGlite returns; it now uses the
      Drizzle query builder (tested on PGlite and over postgres.js).
- [ ] **Vercel project.** Covered by step 5 above. Phase 11 adds the custom
      domain and the final checks.
- [ ] **GitHub repo name.** This folder has no GitHub remote yet; step 1
      creates the repo as `camalberta`. If one already exists under the old
      name, rename it in Settings instead (GitHub redirects the old URL).
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
- [x] **PGlite build-trace warning.** Gone since Phase 9: the data folder
      path is marked `turbopackIgnore`, so `next build` no longer traces the
      whole project for `/api/sync`. (Lazy-importing the PGlite driver would
      still trim the production bundle a little; optional.)
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
