# Threat model and review checklist

What bls POS protects, from whom, and how. Updated 2026-10-31 (end of Phase 9). Read with
[SECURITY.md](SECURITY.md) (the §7 checklist) and [LIMITS.md](LIMITS.md).

## What we protect

| Asset                                   | Why it matters                                                |
| --------------------------------------- | ------------------------------------------------------------- |
| Sales, stock and cost data of each shop | The shop's money and margins; competitors would like it       |
| Staff and owner accounts                | Whoever logs in can sell, void, restock or change prices      |
| Integrity of sales and the activity log | Disputes with staff, theft, and later BIR requirements        |
| Product photos and shop branding        | Some are public by choice (shop page), the rest are private   |
| Availability on the free plan           | 100,000 requests/day shared by every shop on one deployment   |
| Personal data (RA 10173)                | Names, usernames, IP hashes, device types, payment references |

## Who might attack

1. **Another shop** on the same deployment, trying to read or change our data.
2. **A dishonest staff member**: voiding real sales, under-ringing, "losing" stock, covering tracks.
3. **Someone on the internet**: guessing passwords, scraping public pages, CSRF, XSS, flooding.
4. **A thief with a shop phone** that is still logged in.
5. **Someone with database access** (a leaked Cloudflare token, an insider) editing records.
6. **A malicious dependency** in the npm supply chain.

## Threats and controls

| #   | Threat                                              | Controls                                                                                                                                                                                               | Proof                                                        |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| T1  | Cross-shop read or write                            | `shopId` only from the session; every service takes `(db, shopId)`; foreign ids from another shop answer 404 like missing ones; public routes find the shop by code and serve allow-listed fields only | `tenant.test.ts`, per-feature tests, `storefront.test.ts`    |
| T2  | Privilege escalation (staff → admin, admin → owner) | Role checked on the server for every route; only the owner makes admins; nobody edits the owner; role change signs the person out                                                                      | `security.test.ts` (every route × role), `passwords.test.ts` |
| T3  | Password guessing                                   | PBKDF2 + pepper; per-account and per-IP limits; 15-minute lock after 10; Turnstile after 3; same error for wrong user or password; optional TOTP                                                       | `rate-limit.test.ts`, `two-factor.test.ts`                   |
| T4  | Stolen session / lost phone                         | HttpOnly `__Host-` cookie, hashed in the DB; 12 h staff idle; sessions list with log-out; revoked on password change, reset, role change, deactivation                                                 | `sessions-list.test.ts`, `passwords.test.ts`                 |
| T5  | CSRF                                                | `SameSite=Lax` + Origin / Sec-Fetch-Site check on every state-changing request                                                                                                                         | `origin.test.ts`                                             |
| T6  | XSS                                                 | React escaping; no `dangerouslySetInnerHTML` (lint rule); strict CSP without `unsafe-inline` scripts; theme values validated as hex/enum before becoming CSS                                           | `headers.test.ts`, `theme.test.ts`                           |
| T7  | Malicious uploads                                   | JPEG/PNG/WebP by magic bytes, ≤ 2 MB, server-made keys, nosniff, quota                                                                                                                                 | `uploads.test.ts`                                            |
| T8  | Price or total tampering at the till                | Client sends ids and quantities only; prices from the DB; strict schemas                                                                                                                               | `sales.test.ts`                                              |
| T9  | Overselling, duplicate or lost sales                | One D1 batch per sale with a CHECK on stock; idempotency keys (also for offline sync); offline sales never dropped silently (Needs review)                                                             | `sales-rules.test.ts`, `offline-sync.test.ts`, e2e           |
| T10 | Staff hiding a void or stock "loss"                 | Voids and deductions need a reason and are logged with who and when; daily close locks a day's totals; Activity is admin-only                                                                          | `closings.test.ts`, `inventory*.test.ts`                     |
| T11 | Someone editing the DB directly                     | Hash-chained activity log checked in the browser; chain head saved in nightly backups (outside D1); closed days locked by triggers                                                                     | `audit-chain.test.ts`, `closings.test.ts`                    |
| T12 | Spreadsheet formula injection in exports            | Every exported cell starting with `= + - @ tab CR` is prefixed                                                                                                                                         | `export.test.ts`, `sales-list.test.ts`                       |
| T13 | Flooding the free plan                              | Body size limits; Workers rate limiting on public pages; login limits; 60 s edge cache on shop pages                                                                                                   | `LIMITS.md`                                                  |
| T14 | Data loss                                           | Nightly R2 backups (14 days), D1 Time Travel (7 days), owner export any time; shop deletion waits 30 days                                                                                              | `nightly-backup.test.ts`, `delete-shop.test.ts`              |
| T15 | Supply chain                                        | Lockfile in CI, `minimumReleaseAge`, allow-listed build scripts, Dependabot, `pnpm audit` gate                                                                                                         | CI                                                           |
| T16 | Over-collection of personal data                    | No customer data; IPs only as keyed hashes; offline copies without costs and cleared on logout; privacy policy                                                                                         | `privacy` page, code review                                  |

## Known gaps and accepted risks

- **Sealing window:** activity entries are sealed hourly, so an entry can be changed
  within the hour before sealing. Accepted for the free plan's CPU limits.
- **Chain anchoring:** someone who can rewrite the whole chain _and_ every backup could
  hide changes. Owners can note the fingerprint shown by "Check the log".
- **TOTP replay:** a code can be reused within its 90-second window. Low risk (needs the
  password too).
- **Offline device:** sales queued on a phone live in its IndexedDB until synced. A
  stolen, unlocked phone could read them (no costs are stored offline).
- **Shared deployment:** all shops share one Worker's daily request budget; one busy
  shop can exhaust it for others (see `LIMITS.md`).
- **Secret scanning and push protection** are GitHub settings the owner must turn on.
- **Legal text** (privacy, terms, receipt wording) needs review by a lawyer and a tax
  professional before bls POS is offered to other businesses.

## Review checklist (for every change)

- [ ] New route listed in `tests/api/security.test.ts` with its minimum role.
- [ ] New service function takes `(db, shopId, …)`, or is in the `PRE_TENANT` list with a reason.
- [ ] Input parsed with a `.strict()` Zod schema; every string has a max length.
- [ ] No string-built SQL from input; no `dangerouslySetInnerHTML`.
- [ ] Staff responses checked for cost, profit, other staff's data.
- [ ] Sensitive action written to the activity log, with no secrets in details.
- [ ] Cross-shop and wrong-role cases tested, not only the happy path.
- [ ] Anything public (shop page, media) allow-lists fields; nothing internal leaks.
- [ ] Fits the free plan: queries per request, CPU, subrequests (`LIMITS.md`).
- [ ] New dependency: needed, maintained, no install scripts, passes `pnpm audit`.
