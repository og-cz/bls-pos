# Cloudflare free-tier limits

Bilis POS must run at **$0** on services that allow commercial use and never sleep.
These are the limits we design against.

**Verified:** 2026-10-29, from Cloudflare's official docs (page "last updated" dates
in brackets). Free tiers change, so re-check this file before each release.

## Workers (Free plan) — [docs, updated 2026-10-12](https://developers.cloudflare.com/workers/platform/limits/)

| Limit              | Free                                                  | What it means for Bilis POS                                                                                                   |
| ------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Requests           | **100,000 / day**, resets 00:00 UTC (then Error 1027) | Shared by every shop on one deployment. Roughly 30–50 small shops at typical volumes. Static assets do not count (see below). |
| CPU time           | **10 ms per HTTP request**, 10 ms per Cron Trigger    | The tightest limit. See _Password hashing_ below. Keep handlers lean; no heavy work per request.                              |
| Memory             | 128 MB per isolate                                    | Fine for JSON APIs. Never buffer large uploads.                                                                               |
| Subrequests        | 50 per invocation                                     | D1/R2 calls count. Batch D1 queries.                                                                                          |
| Worker size        | 64 MiB uncompressed                                   | No concern.                                                                                                                   |
| Cron Triggers      | **5 per account**                                     | Nightly backup + daily summary use 2.                                                                                         |
| Static assets      | 20,000 files / version, 25 MiB per file               | Plenty for the SPA. Requests served purely from assets are free and unlimited.                                                |
| Env vars + secrets | 64 per Worker, 5 KB each                              | `PEPPER`, `TURNSTILE_SECRET`, `TOTP_ENC_KEY` only.                                                                            |

## D1 (Free plan) — [limits, updated 2026-10-24](https://developers.cloudflare.com/d1/platform/limits/) · [pricing, updated 2026-04-21](https://developers.cloudflare.com/d1/platform/pricing/)

| Limit                                   | Free                    | What it means                                                                                                              |
| --------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Rows read                               | **5,000,000 / day**     | Dashboards must use `daily_summaries` and indexes, never full scans of `sales`.                                            |
| Rows written                            | **100,000 / day**       | One sale ≈ 1 sale + N items + N stock updates + N movements. A 3-item sale ≈ 10 rows → ~10,000 sales/day across all shops. |
| Storage                                 | 5 GB total per account  |                                                                                                                            |
| Database size                           | **500 MB** per database | One database for all shops. Product images live in R2, not D1.                                                             |
| Databases                               | 10 per account          | We use 1 (+1 for preview).                                                                                                 |
| Queries per Worker invocation           | 50                      | Sale creation must be a single `batch()`.                                                                                  |
| Bound parameters per query              | 100                     | Chunk large `IN (...)` lists.                                                                                              |
| SQL statement length                    | 100 KB                  |                                                                                                                            |
| **Time Travel** (point-in-time restore) | **7 days**              | Our nightly R2 backups (14 days) cover longer windows.                                                                     |

When daily read/write limits are hit, **D1 rejects queries until 00:00 UTC**. The app
must show a clear "service busy" error, and offline sales stay queued until then.

## R2 — [pricing, updated 2026-10-26](https://developers.cloudflare.com/r2/pricing/)

| Limit                       | Free (monthly)                    |
| --------------------------- | --------------------------------- |
| Storage                     | 10 GB-month (Standard class only) |
| Class A ops (writes, lists) | 1,000,000                         |
| Class B ops (reads)         | 10,000,000                        |
| Egress                      | **Free**                          |

Per-shop image quota (`maxImagesMB: 200`) × 50 shops = 10 GB, which is the whole free
storage. If the instance grows past ~40 shops, lower the per-shop quota.

## Turnstile — [plans, updated 2026-08-14](https://developers.cloudflare.com/turnstile/plans/)

| Limit            | Free               |
| ---------------- | ------------------ |
| Widgets          | 20 per account     |
| Hostnames        | 10 per widget      |
| Siteverify calls | No published limit |

The docs list "small to medium businesses" and "most production applications" as a fit
for the Free plan. They neither grant nor forbid commercial use outright.

## ⚠️ Open risk: password hashing vs. 10 ms CPU

Section 7.1 asks for PBKDF2-SHA256 at the highest iteration count Workers allows.

Measured 2026-10-29:

| Environment               | Result                                                                           |
| ------------------------- | -------------------------------------------------------------------------------- |
| Local workerd (Miniflare) | 600,000 iterations accepted. No local cap.                                       |
| Node 24, desktop CPU      | 10k ≈ 2 ms · 50k ≈ 8 ms · **100k ≈ 17 ms**                                       |
| Production Workers        | Community reports a 100,000-iteration cap. **Not in official docs. Unverified.** |

So 100k iterations likely uses **more than the 10 ms free CPU budget** on every login
and signup. Cloudflare may let occasional overruns through, or it may fail the request.

**To decide in Phase 1, before writing `feat(auth): add PBKDF2 password hashing`:**
deploy a probe Worker and measure real CPU time and the iteration cap, then choose an
iteration count. The hash string stores the count, so it can be raised later on
re-login. This affects the security model, so it needs the owner's sign-off.

## Free-tier capacity summary

One free deployment comfortably serves **a few dozen small shops**. The limits that
bind first, in order: **Workers requests/day**, then **D1 rows written/day**, then
**R2 storage** (if shops upload many images). Self-hosting (see `DEPLOY_FREE.md`) gives
each owner their own full free quota.
