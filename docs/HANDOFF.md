# Handoff — read this first

For any AI assistant (or person) picking up Bilis POS. Updated 2026-10-29.

## Where things are

- **Repo:** `C:\Users\ogrla\Desktop\fast-pos` (folder still has the old name) → GitHub
  `og-cz/bilis-pos`. Push with `git push https://github.com/og-cz/bilis-pos.git main`
  (the local `origin` still points at the old `fast-pos` URL; GitHub redirects).
- **Plan:** `docs/MASTER_PROMPT.md` (original name "POS Fast" = Bilis POS). Follow it
  phase by phase, one Conventional Commit per planned item.
- **Status:** Phase 0 and Phase 1 done and pushed (see `docs/PROGRESS.md`). Next is
  **Phase 2** in the master prompt: `feat(api): add tenant middleware deriving shop from
session`, then role guard, staff accounts, deactivation, audit log, isolation tests,
  app shell.
- **Brand:** the logo is `public/logo.svg` (from the owner's `bilispos-logo.svg`), shown
  via `BrandLogo` in Bilis blue (`--brand-mark`). Use it, not a generic icon.

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
