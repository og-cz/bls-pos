# Handoff — read this first

For any AI assistant (or person) picking up **BLS POS** (formerly POS Fast / Bilis POS). Updated 2026-10-29.

## Where things are

- **Repo:** `C:\Users\ogrla\Desktop\fast-pos` (folder still has the old name) → GitHub
  `og-cz/bilis-pos`. Push with `git push https://github.com/og-cz/bilis-pos.git main`
  (the local `origin` still points at the old `fast-pos` URL; GitHub redirects).
- **Plan:** `docs/MASTER_PROMPT.md` (original name "POS Fast" = Bilis POS). Follow it
  phase by phase, one Conventional Commit per planned item.
- **Status:** Phases 0–2 done and pushed (see `docs/PROGRESS.md`). Next: the Staff and
  Activity screens (their APIs exist), then **Phase 3** (products and inventory),
  starting with `feat(db): add categories, products and stock_movements schema`.
- **Security tests:** `tests/api/security.test.ts` lists every API route with its
  minimum role. Add new routes there, or CI fails.
- **Brand:** name **BLS POS** (no tagline, no "(bilis)" — owner's call), accent **Bilis Blue `#1E6FD9`**
  (owner's pick). Code names: `bls-pos` (package, Worker, D1), cookie `__Host-bls_session`.
  The logo is `public/logo.svg` (from the owner's `bilispos-logo.svg`), shown via
  `BrandLogo` in `--brand-mark` blue. The owner will send `bls-logo.svg` (a B with a
  lightning bolt): when it arrives, replace `public/logo.svg` and `public/favicon.svg`.
  The GitHub repo is still `og-cz/bilis-pos` until the owner renames it.
- **Unfinished work in `git stash`:** "wip: product CRUD prep" (moves `Actor` to
  `src/worker/lib/actor.ts`, adds product/category audit actions). `git stash pop` to resume.

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
