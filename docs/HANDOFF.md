# Handoff — read this first

For any AI assistant (or person) picking up **bls POS** (formerly POS Fast / Bilis POS). Updated 2026-10-31.

## Where things are

- **Repo:** `C:\Users\ogrla\Desktop\fast-pos` (folder still has the old name) → GitHub
  `og-cz/bilis-pos`. Push with `git push https://github.com/og-cz/bilis-pos.git main`
  (the local `origin` still points at the old `fast-pos` URL; GitHub redirects). GitHub
  now reports the repo moved to `og-cz/bls-pos`; the URL above still works through the
  redirect, so switch only when the owner says so.
- **Plan:** `docs/MASTER_PROMPT.md` (original name "POS Fast" = Bilis POS). Follow it
  phase by phase, one Conventional Commit per planned item.
- **Status:** Phases 0–9 (and 3.5) done; Phase 10 up to **v1.0.0-rc.1** (tagged). **Next:**
  the owner deploys (`docs/DEPLOY_FREE.md`, or add the GitHub secrets for
  `.github/workflows/deploy.yml`), 2–3 pilot shops use it for a few days, then
  `fix: address pilot shop feedback` and `chore(release): v1.0.0` (bump `package.json`,
  `pnpm changelog 1.0.0`, tag). Secrets: `PEPPER`, `TURNSTILE_SECRET`, `TOTP_ENC_KEY`. Deploy steps: `docs/DEPLOY_FREE.md`. Not deployed yet: the owner chose to keep building first (Cloudflare account
  on this PC: audioguyyy@gmail.com; a Turnstile widget is needed before deploying).
- **Security tests:** `tests/api/security.test.ts` lists every API route with its
  minimum role. Add new routes there, or CI fails.
- **Brand:** name **bls POS** (no tagline, no "(bilis)" — owner's call), accent **Bilis Blue `#1E6FD9`**
  (owner's pick). Code names: `bls-pos` (package, D1), Worker `app`, cookie `__Host-bls_session`.
  The logo is `public/logo.svg` (from the owner's `bilispos-logo.svg`), shown via
  `BrandLogo` in `--brand-mark` blue. The owner will send `bls-logo.svg` (a B with a
  lightning bolt): when it arrives, replace `public/logo.svg` and `public/favicon.svg`.
  The GitHub repo is still `og-cz/bilis-pos` until the owner renames it.
- **Before the first deploy:** both D1 databases exist and are migrated; only Turnstile and
  the secrets are left (below).

## Deployment status (2026-10-31) — read before deploying

- Cloudflare account on this PC: **audioguyyy@gmail.com** (account `6ad4e07f1b89790e5bac7b4f5529f1f6`),
  confirmed by the owner as the right one. workers.dev subdomain: `blspos.workers.dev`. The Worker is named
  `app` (owner's pick, 2026-11-01), so the app will be **https://app.blspos.workers.dev**.
- **Done:** D1 `bls-pos` created (APAC), id in `wrangler.jsonc`, all migrations applied remotely.
- **Done (2026-11-01):** photos and backups moved from R2 to a second D1 database
  `bls-pos-media` (binding `MEDIA_DB`, id in `wrangler.jsonc`, migration applied remotely).
  100 MB of photos per shop, 1.9 MB per photo, gzipped backups, edge-cached photo reads.
  R2 stays possible: see `src/worker/adapters/storage/index.ts` and `docs/LIMITS.md`.
- **Owner still has to do:** Turnstile widget for `app.blspos.workers.dev`; create
  `.env.production.local` with `VITE_TURNSTILE_SITE_KEY=…` in the project folder;
  `pnpm exec wrangler secret put` for `PEPPER`, `TURNSTILE_SECRET`, `TOTP_ENC_KEY`
  (typed by the owner, never in chat). Check with `wrangler secret list` (names only).
- Then: `pnpm deploy`, open the URL, sign up, test a sale. Afterwards: pilot shops → v1.0.0.

## Rules the owner set (follow them)

- **Commits are authored by og-cz only.** No `Co-Authored-By`, no Claude/AI mention in
  commits, PRs or the contributor list.
- **Push to GitHub after every commit**, without asking.
- **Real commit dates only.** Never backdate or fake timestamps (also master prompt rule 6).
- **README stays general** — no Filipino-specific wording in it.
- Ask before changing the data model or security model (master prompt rule 7).

## Decisions already made

- PBKDF2 = **100,000** iterations (Workers hard cap), measured on the owner's Cloudflare
  account — see `docs/LIMITS.md`.
- Login limits: 5 failures / 15 min per account, 20 per IP (CGNAT), lock 15 min after
  10 failures, Turnstile after 3 account failures (or 10 per IP).
- TypeScript 6.0 (not 7: typescript-eslint), Vitest 4.1 with `@cloudflare/vitest-plugin`,
  pnpm 12 with `minimumReleaseAge` honoured (no exclusions).
- Owner's Cloudflare account has workers.dev subdomain `pbkdf2-probe` (auto-created);
  they may rename it. The D1 `database_id` in `wrangler.jsonc` is still a placeholder.

## How to work here

- `pnpm dev` (needs `.dev.vars`; copy from `.dev.vars.example`), `pnpm test` (Workers
  runtime, Turnstile mocked in `tests/api/setup.ts`), `pnpm lint`, `pnpm typecheck`,
  `pnpm format:check`, `pnpm exec wrangler types --check` — CI runs all of these.
- After schema changes: `pnpm db:generate --name <name>`, then `pnpm cf-typegen` if
  bindings changed. Schema imports must be relative (drizzle-kit can't read `@shared`).
- Services take `db` then `shopId` first; never read `shop_id` from the request.
