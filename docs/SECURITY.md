# Security

> Skeleton. Every item in master prompt §7 is listed here and checked off only when it
> is implemented **and** covered by a test or a manual check. Phase 9 is done when
> every box is checked.

## Reporting a vulnerability

Please do not open a public issue. Email the maintainer (see the GitHub profile of
`og-cz`) with steps to reproduce.

## Checklist

### 7.1 Passwords

- [x] PBKDF2-HMAC-SHA256 via WebCrypto, 16-byte salt, server-side pepper
- [x] Iteration count stored in hash string (`pbkdf2$sha256$iter$salt$hash`) — 100,000 (Workers max, measured in `LIMITS.md`)
- [x] Min length 10 (owner/admin) / 8 (staff) + common-password list
- [x] Constant-time comparison

### 7.2 Sessions

- [x] 32 random bytes, `__Host-bp_session`, `HttpOnly; Secure; SameSite=Lax; Path=/`
- [x] Only SHA-256 of token stored
- [x] 12 h idle (staff) / 30 d absolute expiry; `last_seen_at` refreshed ≤ every 5 min
- [ ] Revoke on password change, deactivation, role change, "log out all"
- [x] No tokens in localStorage (HttpOnly cookie only)

### 7.3 Login protection

- [x] Rate limit by shop+username (5 failures / 15 min) and IP hash (20 / 15 min — higher because carrier CGNAT puts many phones behind one IP)
- [ ] 15-minute lock after 10 failures ✅ — admins notified in-app ⏳ (`login.locked` is in the audit log; the in-app notice comes with the app shell)
- [x] Turnstile on signup, on login after 3 failures (or 10 per IP), and always on recovery. Fails closed if Cloudflare is unreachable.
- [x] Same generic error for wrong username or wrong password (plus dummy hash so timing matches)

### 7.4 Authorization and tenant isolation

- [x] `shopId` only from session (`tenant` middleware)
- [ ] Every query scoped by `shop_id` ⏳; services take `shopId` first ✅ (enforced by `tests/api/tenant.test.ts`)
- [x] Server-side role check on every route (`tests/api/security.test.ts` fails if a route has no declared access level)
- [ ] Staff never receive cost, profit, others' sales, audit logs
- [ ] Admins cannot create or modify the owner

### 7.5 Input and output

- [ ] Zod `.strict()` on every input, max lengths on all strings
- [ ] Drizzle / prepared statements only
- [x] No `dangerouslySetInnerHTML` — enforced by ESLint (`no-restricted-syntax`)
- [ ] Shop bio and names rendered as plain text

### 7.6 HTTP security headers

- [ ] CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP
- [ ] **Note:** static assets are served without running the Worker, so headers for
      HTML/JS/CSS must also be set via `public/_headers`, not only in Hono middleware.

### 7.7 CSRF

- [ ] Origin check on POST/PUT/PATCH/DELETE

### 7.8 File uploads

- [ ] JPEG/PNG/WebP only, no SVG; magic-byte check; ≤ 2 MB
- [ ] Server-generated keys `shops/{shopId}/{kind}/{id}.webp`
- [ ] Served with stored type, nosniff, `inline`; avatars private; storefront assets gated
- [ ] Per-shop `maxImagesMB` enforced

### 7.9 CSV export

- [ ] Formula-injection prefixing (`= + - @ \t \r`)

### 7.10 Secrets and configuration

- [x] `.dev.vars` git-ignored
- [ ] `PEPPER`, `TURNSTILE_SECRET`, `TOTP_ENC_KEY` via `wrangler secret put` only
- [ ] GitHub secret scanning + Dependabot enabled

### 7.11 Two-factor authentication

- [ ] TOTP for owner/admin, secret AES-GCM encrypted

### 7.12 Account recovery

- [x] 10 hashed one-time recovery codes at signup, shown once, with Download, Print and Copy

### 7.13 Audit log

- [ ] All listed sensitive actions logged ⏳ (done so far: signup, logins, lockouts, recovery, staff create/deactivate; the rest land with their features); no secrets in details ✅ (keys scrubbed, tested)

### 7.14 Backups and data rights

- [ ] Nightly JSON export per shop to private R2, 14-day retention
- [x] D1 Time Travel window recorded in `LIMITS.md` (7 days, Free)
- [ ] Owner data export and shop deletion (soft → hard after 30 days)
- [ ] Privacy policy and terms (RA 10173)

### 7.15 Security tests

- [ ] Cross-shop access denied on every endpoint
- [ ] Staff blocked from every admin endpoint
- [ ] Client-sent prices ignored
- [ ] Concurrent last-item sales never go negative
- [ ] Duplicate idempotency keys never create two sales

### Supply chain (extra)

- [x] pnpm `minimumReleaseAge` honoured (no exclusions); build scripts allow-listed in `pnpm-workspace.yaml`
- [x] CI uses `--frozen-lockfile` and least-privilege `permissions: contents: read`
- [x] API errors never include stack traces (global `onError` returns a generic message)
