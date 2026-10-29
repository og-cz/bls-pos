# Handoff — read this first

For any AI assistant (or person) picking up Bilis POS. Updated 2026-10-29.

## Where things are

- **Repo:** `C:\Users\ogrla\Desktop\fast-pos` (folder still has the old name) → GitHub
  `og-cz/bilis-pos`. Push with `git push https://github.com/og-cz/bilis-pos.git main`
  (the local `origin` still points at the old `fast-pos` URL; GitHub redirects).
- **Plan:** `docs/MASTER_PROMPT.md` (original name "POS Fast" = Bilis POS). Follow it
  phase by phase, one Conventional Commit per planned item.
- **Status:** Phase 0 done (CI green). Phase 1 in progress. Done and pushed:
  schema, migrations + seed, PBKDF2 hashing, signup, login/logout/sessions, rate
  limiting + lockout, Turnstile on signup/login.
- **In progress, NOT committed:** `feat(auth): add one-time recovery codes for owner
password reset`. Written so far (all uncommitted in the working tree):
  - `migrations/0002_recovery_codes.sql`, `recoveryCodes` table in `src/worker/db/schema.ts`
  - `src/worker/security/recovery-codes.ts` (generate / normalize / HMAC-hash codes)
  - signup now issues 10 codes in the same batch and returns `recoveryCodes`
  - `src/worker/services/recovery.ts` + `POST /api/v1/auth/recover` (Turnstile always,
    rate limit key `recover:…`, atomic code spend, revokes all sessions, new session)
  - `recoverSchema` in `src/shared/schemas/auth.ts`; `attemptKeys(..., kind)` in rate-limit
  - **Still to do:** run `pnpm lint && pnpm typecheck && pnpm test`, write
    `tests/api/recovery.test.ts` (signup returns 10 unique codes; codes stored hashed;
    recover works once per code; wrong code → 401 INVALID_RECOVERY; non-owner can't
    recover; old sessions revoked; Turnstile required; rate limited), tick the
    Turnstile-on-recovery + 7.12 items in `docs/SECURITY.md`, apply migration locally
    (`CI=1 pnpm db:migrate:local`), commit, push.
- **Then the rest of Phase 1:** `test(auth): cover hashing, sessions, lockout and
recovery` (mostly covered already — fill gaps), `feat(web): add signup and login
pages` (React; the Turnstile site key test value is `1x00000000000000000000AA`).
  Then write the Phase 1 demo note in `docs/PROGRESS.md`.

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
