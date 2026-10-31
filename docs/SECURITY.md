# Security

Every item in master prompt §7 is listed here and checked off only when it is
implemented **and** covered by a test or a manual check. The threat model and review
checklist are in [THREAT_MODEL.md](THREAT_MODEL.md).

## Reporting a vulnerability

Please do not open a public issue. Email the maintainer (see the GitHub profile of
`og-cz`) with steps to reproduce.

## Checklist

### 7.1 Passwords

- [x] PBKDF2-HMAC-SHA256 via WebCrypto, 16-byte salt, server-side pepper
- [x] Iteration count stored in hash string (`pbkdf2$sha256$iter$salt$hash`) — 100,000 (Workers max, measured in `LIMITS.md`)
- [x] Min length 10 (owner/admin) / 8 (staff) + common-password list (also on password change)
- [x] Constant-time comparison

### 7.2 Sessions

- [x] 32 random bytes, `__Host-bls_session`, `HttpOnly; Secure; SameSite=Lax; Path=/`
- [x] Only SHA-256 of token stored
- [x] 12 h idle (staff) / 30 d absolute expiry; `last_seen_at` refreshed ≤ every 5 min
- [x] Revoked on password change (other devices), staff password reset, deactivation, role change, two-step login turned on, "log out other devices", shop deletion — `tests/api/passwords.test.ts`, `sessions-list.test.ts`, `two-factor.test.ts`
- [x] Active sessions list with log out one / all others (My profile)
- [x] No tokens in localStorage (HttpOnly cookie only)

### 7.3 Login protection

- [x] Rate limit by shop+username (5 failures / 15 min) and IP hash (20 / 15 min — higher because carrier CGNAT puts many phones behind one IP)
- [x] 15-minute lock after 10 failures; admins see locked accounts on the dashboard (and `login.locked` in Activity); a password reset unlocks
- [x] Turnstile on signup, on login after 3 failures (or 10 per IP), and always on recovery. Fails closed if Cloudflare is unreachable.
- [x] Same generic error for wrong username or wrong password (plus dummy hash so timing matches)

### 7.4 Authorization and tenant isolation

- [x] `shopId` only from session (`tenant` middleware)
- [x] Every service takes `(db, shopId, …)` and scopes by it (enforced by `tests/api/tenant.test.ts`; the few public/cron functions are listed with a reason)
- [x] Server-side role check on every route (`tests/api/security.test.ts` fails if a route has no declared access level)
- [x] Staff never receive cost, profit, reports, other staff's sales or the audit log (tested)
- [x] Admins cannot create, change or reset the owner; only the owner makes admins

### 7.5 Input and output

- [x] Zod `.strict()` on every JSON input and query, max lengths on all strings
- [x] Drizzle / prepared statements with bound parameters only (dynamic SQL is built from constants, never from input)
- [x] No `dangerouslySetInnerHTML` — enforced by ESLint (`no-restricted-syntax`); help articles render through a tiny Markdown-to-React renderer
- [x] Shop bio, names and descriptions rendered as plain text

### 7.6 HTTP security headers

- [x] CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP, X-Frame-Options on the app (`public/_headers`) and on every API answer (`src/worker/security/headers.ts`); private API answers are `no-store` — `tests/api/headers.test.ts`

### 7.7 CSRF

- [x] Origin / Sec-Fetch-Site check on POST/PUT/PATCH/DELETE, on top of `SameSite=Lax` — `tests/api/origin.test.ts`

### 7.8 File uploads

- [x] JPEG/PNG/WebP only, no SVG; magic-byte check; ≤ 2 MB
- [x] Server-generated keys `shops/{shopId}/{kind}/{id}.{ext}`
- [x] Served with stored type, nosniff, `inline`; private to the shop; on a public shop page only the logo, cover and shown products' photos, never avatars — `tests/api/storefront.test.ts`
- [x] Per-shop `maxImagesMB` enforced

### 7.9 CSV export

- [x] Formula-injection prefixing (`= + - @ \t \r`) on every export, built in the browser

### 7.10 Secrets and configuration

- [x] `.dev.vars` git-ignored; `.dev.vars.example` holds only throwaway values
- [x] `PEPPER`, `TURNSTILE_SECRET`, `TOTP_ENC_KEY` required by `wrangler.jsonc`, set with `wrangler secret put` (see `DEPLOY_FREE.md`)
- [x] Dependabot updates (`.github/dependabot.yml`) and a CI dependency audit (`pnpm audit --audit-level high`)
- [ ] **Owner:** turn on **Settings → Code security → Secret scanning** and **Push protection** in GitHub (a repository setting, not a file)

### 7.11 Two-factor authentication

- [x] TOTP (RFC 6238, test vectors pass) for owner/admin, secret AES-GCM encrypted with `TOTP_ENC_KEY`; turning it off needs a current code; suggested in setup — `tests/api/two-factor.test.ts`

### 7.12 Account recovery

- [x] 10 hashed one-time recovery codes at signup, shown once, with Download, Print and Copy; owners can make a new set (old ones stop working)
- [x] Staff passwords reset by an admin (temporary password shown once)

### 7.13 Audit log

- [x] Logins (success, failure, lock), recovery, password changes and resets, two-step login on/off, staff create/deactivate/role change, product create/update (incl. price), archive, restock, deduct, sale void, day close, theme, shop and storefront changes, exports, restores, sessions revoked, shop deleted; no secrets in details (keys scrubbed, tested)
- [x] Tamper-evident: hourly hash chain per shop, checked in the browser (Activity → Check the log); chain head kept in each nightly backup — `tests/api/audit-chain.test.ts`

### 7.14 Backups and data rights

- [x] Nightly JSON export per shop to private R2 (`backups/…`, never served), 14-day retention — `tests/api/nightly-backup.test.ts`
- [x] D1 Time Travel window recorded in `LIMITS.md` (7 days, Free)
- [x] Owner data export (Products → Export, full backup) and shop deletion (soft, erased after 30 days) — `tests/api/delete-shop.test.ts`
- [x] Privacy policy and terms (RA 10173) at `/privacy` and `/terms`. **TODO(lawyer):** review before offering bls POS to other businesses.

### 7.15 Security tests

- [x] Cross-shop access denied on every endpoint (`tenant.test.ts`, per-feature tests)
- [x] Staff blocked from every admin endpoint (`security.test.ts` walks every route)
- [x] Client-sent prices, totals or shop refused; prices always from the database (`sales.test.ts`)
- [x] Concurrent last-item sales never go negative (`sales-rules.test.ts`)
- [x] Duplicate idempotency keys never create two sales (`sales.test.ts`, `offline-sync.test.ts`)
- [x] End-to-end: sale, cashier login, offline sale and sync in a real browser (`tests/e2e`, Playwright, in CI)

### 7.16 BIR-ready design

- [x] Receipts say they are not an official receipt or invoice (wording to confirm with a tax professional)
- [x] Sequential sale numbers per shop, never reused; voids keep their number
- [x] Daily close with locked totals (`daily_closings`, database triggers)
- [x] Tamper-evident audit log (see 7.13)

### Supply chain (extra)

- [x] pnpm `minimumReleaseAge` honoured (no exclusions); build scripts allow-listed in `pnpm-workspace.yaml`
- [x] CI uses `--frozen-lockfile` and least-privilege `permissions: contents: read`
- [x] API errors never include stack traces (global `onError` returns a generic message)
