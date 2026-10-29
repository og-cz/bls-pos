# Architecture

> Skeleton — sections are filled in as each phase lands.

## Overview

Bilis POS is **one Cloudflare Worker** serving two things from one origin:

- **Static assets** — the React SPA build (`dist/client`), served by Workers Static
  Assets. Unknown paths fall back to `index.html` (`not_found_handling:
single-page-application`).
- **API** — `/api/v1/*`, handled by a Hono app. `run_worker_first: ["/api/*"]` makes
  sure API paths always reach the Worker, never the SPA fallback.

One origin means no CORS, `SameSite=Lax` cookies work, and the CSP can stay `'self'`.

```
Browser / PWA ──HTTPS──► Worker "bilis-pos"
                           ├─ static assets (SPA)
                           └─ /api/v1/* → Hono → services → D1 / R2
Cron Trigger ──► backups + daily summaries
```

## Stack and pinned versions

Checked 2026-10-29. Where we deliberately stay below the newest release, the reason is
listed.

| Area       | Package                                                | Version | Note                                                            |
| ---------- | ------------------------------------------------------ | ------- | --------------------------------------------------------------- |
| Runtime    | wrangler                                               | 4.154   | pnpm `minimumReleaseAge` holds back brand-new releases          |
| Dev server | @cloudflare/vite-plugin                                | 1.65    | Runs the Worker inside Vite dev                                 |
| API        | hono                                                   | 4.13    |                                                                 |
| Client     | react / react-dom                                      | 19.3    |                                                                 |
| Build      | vite                                                   | 8.3     |                                                                 |
| Styling    | tailwindcss                                            | 4.3     | shadcn/ui "new-york" style, CSS variables                       |
| Language   | typescript                                             | **6.0** | TS 7.0 is out, but typescript-eslint supports `<6.1` only       |
| Lint       | eslint 10 + typescript-eslint 8 (strict, type-checked) |         |                                                                 |
| Tests      | vitest                                                 | **4.1** | `@cloudflare/vitest-plugin` (the renamed `vitest-pool-workers`) |
| ORM        | drizzle-orm / drizzle-kit                              | —       | Added in Phase 1                                                |
| Validation | zod                                                    | —       | Added in Phase 1                                                |

## Source layout

```
src/client/   React app (Vite root is the repo root; entry index.html → src/client/main.tsx)
src/worker/   Hono API — index.ts, middleware/, routes/, services/, adapters/, db/, security/
src/shared/   Code used by both sides: Zod schemas, entitlements, money utils
tests/api/    Vitest inside workerd (Miniflare)
tests/e2e/    Playwright (Phase 9)
```

TypeScript project references: `tsconfig.client.json` (DOM), `tsconfig.worker.json`
(Workers runtime types from `wrangler types`), `tsconfig.test.json`,
`tsconfig.node.json` (config files). `pnpm typecheck` runs `tsc -b` over all of them.

## Request pipeline

_To do (Phase 2 / Phase 9)._ Order: security headers → origin check → body limit →
session → tenant → role guard → Zod → handler → service → audit log. See master prompt §5.1.

## Data model

_To do (Phase 1)._ See master prompt §4.

## Adapters and entitlements

_To do (Phase 3–4)._ `src/worker/adapters/` (storage, payments, notifications) and
`src/shared/entitlements.ts` with a single `can(shop, feature)` helper.

## Offline sync

_To do (Phase 8)._
