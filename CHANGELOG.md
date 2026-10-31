# Changelog

All notable changes, newest first. Generated from Conventional Commits by
`scripts/changelog.mjs`; the summary under each version is written by hand.

## 1.0.0-rc.1 — 2026-10-31

First release candidate of the free edition, for pilot shops. Everything in the master
prompt's Phases 0–9 plus Phase 10's polish: selling (cash and other payments, receipts,
barcode scanning), products with photos, inventory, staff and roles, bulk import/export
and backups, dashboard and reports with daily close, shop branding and a public shop
page, a setup guide, tours and help, an installable app that sells offline, and the
security work (two-step login, tamper-evident activity log, nightly backups). Not
BIR-accredited: receipts say they are not official.

### Features

- **db:** add Drizzle schema for shops, users and sessions (2a40a4e)
- **db:** add migrations and local seed script (bc75475)
- **auth:** add PBKDF2 password hashing with salt and pepper (dad8691)
- **auth:** add owner signup that creates shop and owner account (739ac82)
- **auth:** add login, logout and secure session cookies (5209ffb)
- **auth:** add login rate limiting and temporary lockout (bf4558b)
- **auth:** verify Turnstile on signup and repeated logins (c7d6840)
- **auth:** add one-time recovery codes for owner password reset (31a594c)
- **web:** add signup and login pages (8c7616e)
- **api:** add tenant middleware deriving shop from session (f9884ae)
- **api:** add role guard middleware for owner, admin and staff (3896592)
- **staff:** let admins create staff accounts with temporary passwords (b986957)
- **staff:** deactivate staff and revoke their sessions (5a3ff9e)
- **audit:** add audit log for sensitive actions (bc79131)
- **web:** add app shell with role-based navigation (b42b577)
- **web:** add staff and activity screens (6a9f7e5)
- **db:** add categories, products and stock_movements schema (0f4ccce)
- **products:** add admin product CRUD API with validation (076f6cf)
- **products:** add categories and product archiving (536ece1)
- **storage:** add R2 storage adapter with validated image uploads (9295bf3)
- **inventory:** add admin restock and staff deduct with reasons (0f80a6d)
- **inventory:** add low-stock thresholds and alerts (d051bc2)
- **web:** add product list with search and category filters (a4133eb)
- **web:** add product form with client-side image compression (fe0b963)
- **web:** add inventory screen with restock and deduct (75283b5)
- **plans:** raise the Free product limit to 5,000 (c243922)
- **import:** add CSV/XLSX template and Web Worker parser (7925fb8)
- **products:** show a photo beside every product, tap to view full size (868aff4)
- **web:** add Settings with themes, product views and a hamburger menu (e5c2c40)
- **web:** put the menu button in the side menu and Settings at its bottom (1c35739)
- **import:** add row validation and editable error preview (c7087aa)
- **products:** take or add a product photo with a centering guide and editor (833a725)
- **import:** add chunked bulk upsert by SKU with progress (0d817b2)
- **import:** add bulk image upload matched by file name (7246477)
- **export:** add CSV/XLSX export of products, stock and movements (c6a4140)
- **backup:** add full shop backup download and restore (6d4fd07)
- **db:** add sales and sale_items schema with stock CHECK constraint (773b36a)
- **sales:** add atomic sale creation with server-side pricing (d479190)
- **sales:** add idempotency keys to prevent duplicate sales (1fbdfeb)
- **payments:** add payment adapter with cash and manual methods (eb47f7a)
- **sales:** add admin sale voiding with reason and restock (d5e3839)
- **web:** add sell screen with product grid and cart (aa6e257)
- **web:** add cash checkout with quick amounts and change (ab5ffbb)
- **web:** add receipt view with print support (b9d6083)
- **web:** add SKU search and barcode scanner input (8bab444)
- **reports:** add daily summary cron in shop timezone (40c42bf)
- **reports:** add income by day, week and month (d692a9b)
- **reports:** add top products and sales by staff (897cf96)
- **web:** add admin dashboard with KPI cards and charts (7decb6c)
- **sales:** add shift view, sales list with voiding and CSV export (504d5b2)
- **reports:** add daily close report with locked totals (8b8123b)
- **theme:** add theme schema and OKLCH palette generator (8c63bde)
- **theme:** add automatic contrast checking (088a6db)
- **web:** add color wheel and presets with live preview (199874e)
- **web:** add cover photo and logo upload with cropping (4b36424)
- **web:** add Settings to the profile menu (a8a72c2)
- **web:** group the menu into Overview, Selling, Stock and Shop (bde843f)
- **web:** add dark mode and font choices (0b9887b)
- **profile:** add user avatars and display names (2c7d9bc)
- **storefront:** add public shop profile page (5429746)
- **storefront:** add visibility settings and reserved slugs (01fa4e7)
- **storefront:** add share link and QR code (046dbe5)
- **onboarding:** add setup wizard steps for shop and branding (4f831d2)
- **onboarding:** add wizard steps for products, staff and security (090e6c4)
- **onboarding:** add business-type presets and sample products (d06d4c3)
- **tour:** add guided tours for owners, admins and staff (2577970)
- **help:** add in-app help center (2ef4114)
- **pwa:** add manifest, icons and service worker (afbcd3e)
- **pwa:** cache app shell and product list (11e6cc5)
- **offline:** queue sales in IndexedDB while offline (b4d597e)
- **offline:** sync queued sales and add needs-review list (f62b7ea)
- **web:** add online and offline status indicator (8a78ad7)
- **security:** add CSP and security headers (20e0cad)
- **security:** add origin check for state-changing requests (e178fe5)
- **auth:** add optional TOTP two-factor for owners and admins (4274d8a)
- **auth:** add active sessions page and log out all devices (2970676)
- **backup:** add nightly backup export to R2 (fdc0d8a)
- **audit:** add hash-chained tamper-evident audit log (a6eff81)
- **account:** let the owner delete the shop, erased after 30 days (ab31679)
- **a11y:** complete accessibility pass (8ae4f0f)

### Fixes

- **test:** narrow member role in the permission matrix (810e2ab)
- **web:** give product names room on phone-sized screens (07d1f85)
- **web:** make the grouped side menu compact (cde3e02)
- **security:** add password change, staff password reset and role change (66763fa)
- **security:** show admins which accounts are locked out (7d523c9)

### Performance

- lazy-load each screen (f590c3e)
- add a bundle budget check and lazy-load remaining images (c2c0850)

### Tests

- **auth:** cover hashing, sessions, lockout and recovery (5006ab4)
- **security:** add tenant isolation and role permission tests (8c85307)
- **inventory:** cover stock movements and permission rules (b96b684)
- **import:** cover 5,000-row import, duplicates, bad rows and restore (4e088be)
- **sales:** cover concurrent oversell, voids and duplicate submits (d17a288)
- **offline:** cover offline sale, sync and conflict handling (0e575b6)
- **backup:** restore the backup import tests beside the nightly backup tests (8dfa80a)
- **e2e:** add Playwright tests for critical flows (1a9e4d6)

### Documentation

- add LIMITS.md with verified Cloudflare free-tier limits (b2d447f)
- add ARCHITECTURE, SECURITY and ROADMAP skeletons (47b4789)
- add logo, badges and tagline to README (7012e2d)
- keep README description general (422d711)
- record measured PBKDF2 cost on Workers free plan (78ddbb6)
- add handoff notes for continuing the project (c76978b)
- add Phase 1 demo note (af1f7c4)
- add Phase 2 demo note (46758c4)
- rename to BLS and plan bulk import and BIR-ready groundwork (0879015)
- update handoff after Phase 3 backend (4abb1af)
- add Phase 3 demo note (aa0d803)
- add Phase 5 demo note and mark dashboard and reports done (5053614)
- add Phase 6 demo note and mark branding and storefront done (93db646)
- add free self-hosting deployment guide (84bd0ff)
- add Phase 7 demo note and mark onboarding and help done (048fa21)
- add Phase 8 demo note and update offline help (2587516)
- **legal:** add privacy policy and terms pages (0325b4e)
- **security:** add threat model and review checklist (85c8084)

### Maintenance

- initialize repository with README, LICENSE, .gitignore, .editorconfig (821a0ca)
- set up pnpm, TypeScript strict config, ESLint and Prettier (da16768)
- scaffold React + Vite client with Tailwind and shadcn/ui (d5f6b3b)
- scaffold Hono worker serving API and static assets via wrangler (674a69a)
- add GitHub Actions for lint, typecheck and tests (bba1096)
- rename project from POS Fast to Bilis POS (eefdbd8)
- **web:** show the logo in Bilis blue (b7dd0e3)
- rename the app to BLS (ed0981d)
- show the app as BLS POS, without a tagline (093097d)
- write the app name as bls POS (9eac49e)
- **web:** make dark mode one consistent surface like light mode (93faf63)
- **web:** give both themes a page layer and a raised surface layer (793aaea)
- **security:** enable Dependabot, secret scanning and dependency audit (c6a0daa)
- configure production environment (b93cff8)
