# BLS POS — Master Build Prompt

> **How to use this file:** Paste this whole document into your AI coding assistant (or keep it in the repo as `docs/MASTER_PROMPT.md`) and work through it one phase at a time. Every phase lists its goal, what to build, what "done" means, and the dated commit plan.

---

## 0. Role and ground rules for the AI assistant

You are the lead engineer building **BLS POS**, a fast, secure, beautifully branded point-of-sale web app for small businesses. Follow these rules for the entire project:

1. **Focus.** Build the **Free edition** only. The Paid edition is *prepared for* (adapters, plan field, feature flags) but **never built** until Phase 11+. If a task drifts into paid features, stop and note it in `docs/ROADMAP.md` instead.
2. **Security first.** Every API route checks: (a) is the user logged in, (b) which shop they belong to, (c) whether their role allows this action. No exceptions. Never trust anything the browser sends about price, role, or shop.
3. **Simple over clever.** BLS POS: fast to set up, fast to sell, fast to grow. Every screen must be usable by a new cashier within one minute. If a feature needs a manual to understand, simplify it.
4. **$0 to run.** Only use services with a free tier that allows commercial use and does not sleep.
5. **Small commits.** One logical change per commit, using Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `perf:`, `ci:`).
6. **Honest history.** The commit schedule in Section 12 is a *plan*. Make each commit when the work is actually done. Never backdate or fake commit timestamps.
7. **Ask before guessing** on anything that changes the data model or security model.
8. **Verify current limits.** Free-tier limits change. Before Phase 0 ends, check Cloudflare's current Workers, D1, R2 and Turnstile free limits and record them in `docs/LIMITS.md`.

---

## 1. Product overview

**BLS POS** is a multi-store web POS. Any business can sign up, brand their store, add products, add staff, and start selling from a phone or PC, with a live dashboard available 24/7.

### 1.0 Names and identity

| Thing | Name |
|---|---|
| Product (titles, UI, docs, page titles, manifest, default sender names) | **BLS POS** (short form "BLS" in tight spaces, e.g. the PWA short name). No tagline |
| Repo / package / Worker | `bls-pos` |
| D1 database / R2 bucket | `bls-pos` / `bls-pos-media` |
| Session cookie | `__Host-bls_session` |
| PWA | name "BLS POS", short name "BLS" |
| Logo | `bls-logo.svg` (a B with a lightning bolt), provided by the owner. Used for the app icon, favicon, login screen and PWA icons; PNG icon sizes are generated from it in Phase 8 |

### 1.1 Who uses it

| Role | Who | Can do |
|---|---|---|
| **Owner** | The person who created the shop (exactly one per shop) | Everything an Admin can, plus: delete shop, transfer ownership, manage admins, view recovery codes, billing (later) |
| **Admin** | Trusted manager | Add, edit, archive products; restock; set prices; manage staff; void sales; view all income and reports; change branding |
| **Staff** | Cashier / crew | Sell (cart → checkout), deduct stock with a reason (damaged, expired, used, lost), view products and stock, view **their own** sales for today |

### 1.2 Core features (Free edition)

- Owner signup with a guided **setup wizard** (shop name, type, colors, cover photo, first products, staff).
- **Products & inventory:** categories, price, cost (admin-only), stock, low-stock alerts, product photos.
- **Stock movements:** every add or deduct is logged with who, when, how many and why.
- **Sell screen:** fast tap grid, search, SKU/barcode-scanner input, cart, cash checkout with change calculation, receipt view.
- **Dashboard:** today's income, income by day/week/month, top products, sales by staff, low stock list, CSV export.
- **Branding:** cover photo, logo, color wheel **or** presets, light/dark mode — applied to the whole app for that shop.
- **Social-style shop profile:** each shop gets a public page (`/s/your-shop`) with cover, logo, bio, and an optional product showcase plus a shareable QR code. Each user has a profile (avatar, display name).
- **Onboarding:** setup wizard, guided tours for owners and staff, in-app help center.
- **Installable app (PWA)** for phones and PCs, with offline selling that syncs when the connection returns.
- **Security:** hashed passwords, secure sessions, rate-limited login, bot protection, optional 2FA, audit log, tenant isolation, backups.

### 1.3 Out of scope for Free (prepared, not built)

Online payments (GCash, Maya, cards), email/SMS receipts, password reset by email, multiple branches, AI insights, advanced reports, custom domains, subscriptions/billing. See Section 13.

---

## 2. Architecture

### 2.1 Stack (all free, commercial use allowed, never sleeps)

| Layer | Choice | Why |
|---|---|---|
| Hosting + API | **Cloudflare Workers** (one Worker serving the API **and** the static frontend via Workers Static Assets) | Free tier allows business use, doesn't sleep, global edge. One origin = no CORS headaches and safer cookies. |
| Database | **Cloudflare D1** (SQLite) | Free, no pause, transactional `batch()`. |
| File storage | **Cloudflare R2** | Cover photos, logos, product images, backups. No egress fees. |
| Bot protection | **Cloudflare Turnstile** | Free CAPTCHA alternative on signup/login. |
| Scheduled jobs | **Workers Cron Triggers** | Nightly backups and daily summaries. |
| API framework | **Hono** | Small, fast, built for Workers. |
| ORM | **Drizzle ORM** + drizzle-kit migrations | Type-safe, parameterized queries only. |
| Validation | **Zod** (shared between client and server) | One schema, validated on both sides. Server validation is the one that counts. |
| Frontend | **React + Vite + TypeScript (strict)** | Fast builds, huge ecosystem. |
| Styling | **Tailwind CSS** + **shadcn/ui** (Radix) | Polished, accessible components; easy theming with CSS variables. |
| Data fetching | **TanStack Query** | Caching, retries, offline-friendly. |
| Charts | **Recharts** | Simple dashboard charts. |
| Color picker | **react-colorful** | Tiny color wheel. |
| Palette math | **culori** (OKLCH) | Generates good-looking shades from one brand color. |
| Guided tours | **driver.js** | Lightweight onboarding tours. |
| PWA | **vite-plugin-pwa** (Workbox) | Installable app + offline shell. |
| Offline storage | **IndexedDB** via `idb` | Offline sale queue and product cache. |
| Testing | **Vitest** + `@cloudflare/vitest-pool-workers`, **Playwright** | API tests in the real Workers runtime; end-to-end flows. |
| CI | **GitHub Actions** | Lint, typecheck, test, deploy. |
| Package manager | **pnpm** | Fast, strict. |

### 2.2 System diagram

```
 ┌─────────────────────────────┐        ┌─────────────────────────────┐
 │  Phone (installed PWA)      │        │  PC browser (dashboard)     │
 └──────────────┬──────────────┘        └──────────────┬──────────────┘
                │            HTTPS only (HSTS)          │
                ▼                                       ▼
 ┌────────────────────────────────────────────────────────────────────┐
 │                 Cloudflare Worker: bls-pos                         │
 │  ┌──────────────────────┐   ┌───────────────────────────────────┐  │
 │  │ Static assets (SPA)  │   │ /api/* — Hono                     │  │
 │  │ React build output   │   │  security headers → origin check  │  │
 │  └──────────────────────┘   │  → session → tenant → role guard  │  │
 │                             │  → Zod validation → handler       │  │
 │                             │  → audit log                      │  │
 │                             └───────┬───────────────┬───────────┘  │
 └─────────────────────────────────────┼───────────────┼──────────────┘
                                       ▼               ▼
                          ┌────────────────┐   ┌─────────────────┐
                          │ D1 (SQLite)    │   │ R2 (images,     │
                          │ shops, users,  │   │ backups)        │
                          │ products,sales │   └─────────────────┘
                          └────────────────┘
          Cron Trigger (nightly) ──► backup export to R2 + daily summaries
          Turnstile ──► verifies signup / login is human
```

### 2.3 Adapter layer (prepares for Paid without building it)

All outside services sit behind interfaces in `src/worker/adapters/`. The Free edition ships one implementation of each. Paid editions add more implementations later **without touching core POS logic**.

```ts
// src/worker/adapters/types.ts
export interface StorageAdapter {
  put(key: string, data: ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream; contentType: string } | null>;
  delete(key: string): Promise<void>;
}

export interface PaymentAdapter {
  id: PaymentMethodId;            // 'cash' in Free
  label: string;
  // Free: cash is recorded instantly. Paid: returns a pending intent to confirm.
  createPayment(input: { saleId: string; amountCents: number; currency: string }):
    Promise<{ status: 'paid' | 'pending'; reference?: string }>;
}

export interface NotificationAdapter {   // Free: NoopNotifier (in-app only)
  send(input: { to: string; template: string; data: Record<string, unknown> }): Promise<void>;
}

export interface AiAdapter {            // Free: not registered at all
  summarize(input: unknown): Promise<string>;
}
```

- `src/worker/adapters/storage/r2.ts` — Free
- `src/worker/adapters/payments/cash.ts` — Free
- `src/worker/adapters/notifications/noop.ts` — Free
- `src/worker/adapters/registry.ts` — picks adapters based on the shop's **plan** and **entitlements**.

### 2.4 Plans and feature flags (built now, used later)

```ts
// src/shared/entitlements.ts
export type Plan = 'free' | 'pro' | 'business';

export const ENTITLEMENTS = {
  free: {
    maxProducts: 500,
    maxStaff: 5,
    maxImagesMB: 200,
    paymentMethods: ['cash', 'other_manual'],
    emailReceipts: false,
    multiBranch: false,
    aiInsights: false,
    customDomain: false,
    reportHistoryDays: 365,
  },
  pro: { /* defined in Phase 11 */ },
  business: { /* defined in Phase 11 */ },
} as const;
```

- Every shop row has `plan TEXT NOT NULL DEFAULT 'free'`.
- One helper, `can(shop, 'emailReceipts')`, decides features. Never scatter `if (plan === 'pro')` checks through the code.
- Limits (max products, max staff) are enforced **on the server**. The UI shows friendly messages when a limit is reached.

---

## 3. Project structure

```
bls-pos/
├─ src/
│  ├─ client/                      # React app
│  │  ├─ app/                      # routes, layouts, providers
│  │  ├─ features/
│  │  │  ├─ auth/  onboarding/  sell/  products/  inventory/
│  │  │  ├─ dashboard/  staff/  branding/  storefront/  settings/  help/
│  │  ├─ components/ui/            # shadcn/ui components
│  │  ├─ lib/                      # api client, theme engine, offline queue
│  │  └─ styles/
│  ├─ worker/                      # Cloudflare Worker (API)
│  │  ├─ index.ts                  # Hono app + static asset fallthrough
│  │  ├─ middleware/               # headers, origin, session, tenant, role, rateLimit
│  │  ├─ routes/                   # auth, shops, users, products, inventory, sales, reports, uploads, storefront
│  │  ├─ services/                 # business logic (no HTTP here)
│  │  ├─ adapters/                 # storage, payments, notifications (see 2.3)
│  │  ├─ db/schema.ts              # Drizzle schema
│  │  ├─ security/                 # password, tokens, totp, turnstile
│  │  └─ cron.ts                   # scheduled jobs
│  └─ shared/                      # Zod schemas, types, entitlements, money utils
├─ migrations/                     # SQL migrations (drizzle-kit)
├─ tests/
│  ├─ api/                         # Vitest in Workers runtime
│  └─ e2e/                         # Playwright
├─ docs/
│  ├─ ARCHITECTURE.md  SECURITY.md  THREAT_MODEL.md  LIMITS.md
│  ├─ DEPLOY_FREE.md  ROADMAP.md  CONTRIBUTING.md
├─ wrangler.jsonc
├─ .github/workflows/ci.yml
└─ README.md
```

---

## 4. Data model

**Rules for every table:**
- IDs are random strings (UUIDv7 or similar), never auto-increment numbers in URLs.
- Money is stored as **integer centavos** (`price_cents INTEGER`). Never floating point.
- Timestamps are stored in UTC (epoch ms). Reports convert using the shop's timezone (default `Asia/Manila`).
- Every tenant-owned table has `shop_id` and an index on it.
- Sales are **never deleted**. They are voided.

```sql
-- Shops (tenants)
CREATE TABLE shops (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,              -- for /s/:slug, lowercase, 3–40 chars
  name TEXT NOT NULL,
  business_type TEXT NOT NULL,            -- 'cafe' | 'retail' | 'sari_sari' | 'salon' | 'food_stall' | 'other'
  bio TEXT,
  currency TEXT NOT NULL DEFAULT 'PHP',
  timezone TEXT NOT NULL DEFAULT 'Asia/Manila',
  plan TEXT NOT NULL DEFAULT 'free',
  theme_json TEXT NOT NULL,               -- validated by Zod (see Section 6)
  logo_key TEXT, cover_key TEXT,          -- R2 object keys
  storefront_enabled INTEGER NOT NULL DEFAULT 0,
  storefront_show_prices INTEGER NOT NULL DEFAULT 1,
  storefront_show_stock INTEGER NOT NULL DEFAULT 0,
  onboarding_step INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);

-- Users (belong to exactly one shop in Free; multi-shop is a Paid feature)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  username TEXT NOT NULL,                 -- unique per shop
  display_name TEXT NOT NULL,
  avatar_key TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','staff')),
  password_hash TEXT NOT NULL,            -- format: pbkdf2$sha256$iterations$salt$hash
  totp_secret_enc TEXT,                   -- encrypted; NULL if 2FA off
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE (shop_id, username)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,        -- SHA-256 of the cookie token; raw token never stored
  user_id TEXT NOT NULL REFERENCES users(id),
  shop_id TEXT NOT NULL,
  user_agent TEXT, ip_hash TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE recovery_codes (             -- owner password reset without email (Free)
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  code_hash TEXT NOT NULL,
  used_at INTEGER
);

CREATE TABLE login_attempts (             -- rate limiting
  key TEXT NOT NULL,                      -- e.g. 'ip:<hash>' or 'user:<shop>:<username>'
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, window_start)
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (shop_id, name)
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  category_id TEXT REFERENCES categories(id),
  name TEXT NOT NULL,
  sku TEXT,                               -- unique per shop when present
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  cost_cents INTEGER CHECK (cost_cents >= 0),   -- admin-only field
  track_stock INTEGER NOT NULL DEFAULT 1,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (track_stock = 0 OR stock >= 0),  -- prevents overselling
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  image_key TEXT,
  show_on_storefront INTEGER NOT NULL DEFAULT 1,
  archived_at INTEGER,                    -- "remove product" = archive, keeps sales history intact
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX products_shop_sku ON products(shop_id, sku) WHERE sku IS NOT NULL;

CREATE TABLE stock_movements (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  delta INTEGER NOT NULL,                 -- +restock, -sale, -deduct
  reason TEXT NOT NULL CHECK (reason IN ('restock','sale','void','damaged','expired','used','lost','correction')),
  note TEXT,
  sale_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  number INTEGER NOT NULL,                -- human receipt number per shop
  user_id TEXT NOT NULL REFERENCES users(id),
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  payment_method TEXT NOT NULL,           -- 'cash' | 'other_manual' (Free); more in Paid
  payment_reference TEXT,
  cash_received_cents INTEGER,
  change_cents INTEGER,
  idempotency_key TEXT NOT NULL,          -- prevents duplicate sales on retry/offline sync
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','voided')),
  voided_by TEXT, voided_at INTEGER, void_reason TEXT,
  created_at INTEGER NOT NULL,
  client_created_at INTEGER,              -- time on device (offline sales)
  UNIQUE (shop_id, idempotency_key),
  UNIQUE (shop_id, number)
);

CREATE TABLE sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id),
  shop_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  name_snapshot TEXT NOT NULL,            -- product name at time of sale
  unit_price_cents INTEGER NOT NULL,      -- price at time of sale (from server, not client)
  unit_cost_cents INTEGER,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total_cents INTEGER NOT NULL
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  -- prev_hash / hash: tamper-evident hash chain per shop (Section 7.16, added in Phase 9)
  shop_id TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,                   -- 'product.update', 'sale.void', 'staff.create', 'login.failed', ...
  target_type TEXT, target_id TEXT,
  details_json TEXT,                      -- never include passwords, tokens or secrets
  ip_hash TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE daily_closings (            -- Z-reading style daily close (Section 7.16); never edited after closing
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  day TEXT NOT NULL,                      -- 'YYYY-MM-DD' in shop timezone
  first_sale_number INTEGER, last_sale_number INTEGER,
  sales_count INTEGER NOT NULL,
  gross_cents INTEGER NOT NULL,
  voided_count INTEGER NOT NULL,
  voided_cents INTEGER NOT NULL,
  payments_json TEXT NOT NULL,            -- totals per payment method
  closed_by TEXT NOT NULL REFERENCES users(id),
  closed_at INTEGER NOT NULL,
  UNIQUE (shop_id, day)
);

CREATE TABLE daily_summaries (            -- filled by cron for fast dashboards
  shop_id TEXT NOT NULL,
  day TEXT NOT NULL,                      -- 'YYYY-MM-DD' in shop timezone
  sales_count INTEGER NOT NULL,
  gross_cents INTEGER NOT NULL,
  voided_cents INTEGER NOT NULL,
  cost_cents INTEGER NOT NULL,
  PRIMARY KEY (shop_id, day)
);
```

**Paid-ready columns/tables to add later (do not build now, just keep room for them):** `branches`, `subscriptions`, `invoices`, `customers`, `payment_intents`, `api_keys`, `webhooks`.

---

## 5. API design

- Base path: `/api/v1`. JSON only. All bodies validated with Zod; unknown fields rejected (`.strict()`).
- Errors: `{ "error": { "code": "STOCK_INSUFFICIENT", "message": "Not enough stock for Iced Latte" } }`. Never leak stack traces or SQL.
- Pagination: cursor-based (`?cursor=...&limit=50`, max 100).

### 5.1 Middleware order (every request)

1. **Security headers** (Section 7.6).
2. **Origin check** on POST/PUT/PATCH/DELETE: `Origin` must equal the app's own origin, otherwise 403 (CSRF protection).
3. **Body size limit** (JSON 64 KB; uploads handled separately).
4. **Session**: read the `__Host-bls_session` cookie → hash → look up an active, unexpired, unrevoked session → load user (must be `active`).
5. **Tenant**: set `c.var.shopId = session.shop_id`. **Never** read `shop_id` from URL, body or query.
6. **Role guard** per route: `requireRole('admin')` etc.
7. **Zod validation**.
8. **Handler → service** (business logic lives in services, which always take `shopId` as their first argument).
9. **Audit log** for sensitive actions.

### 5.2 Endpoints

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/auth/signup` | public + Turnstile | Creates shop + owner, returns recovery codes once |
| POST | `/auth/login` | public + Turnstile after 3 fails | `shopSlug + username + password` (+ TOTP if enabled) |
| POST | `/auth/logout` | any | Revokes current session |
| POST | `/auth/logout-all` | any | Revokes all own sessions |
| POST | `/auth/recover` | public + Turnstile | Owner resets password with a recovery code |
| POST | `/auth/password` | any | Change own password; revokes other sessions |
| POST | `/auth/2fa/setup`, `/auth/2fa/verify`, `/auth/2fa/disable` | owner/admin | TOTP |
| GET | `/me` | any | User, role, shop, theme, entitlements |
| PATCH | `/me/profile` | any | Display name, avatar |
| GET/PATCH | `/shop` | admin (GET: any) | Name, bio, type, timezone, storefront settings |
| PATCH | `/shop/theme` | admin | Theme JSON (Zod-validated) |
| GET/POST | `/staff` | admin | List/create staff (enforces `maxStaff`) |
| PATCH | `/staff/:id` | admin | Rename, change role (admin cannot create owner), reset password |
| POST | `/staff/:id/deactivate` | admin | Deactivates + revokes all sessions |
| GET | `/categories`, POST/PATCH/DELETE | read: any, write: admin | |
| GET | `/products` | any | Staff never receive `cost_cents` |
| POST/PATCH | `/products`, `/products/:id` | admin | Enforces `maxProducts` |
| POST | `/products/:id/archive` | admin | "Remove" = archive |
| POST | `/inventory/restock` | admin | `+qty` with note |
| POST | `/inventory/deduct` | staff+ | `-qty` with required reason |
| GET | `/inventory/movements` | admin (staff: own only) | |
| POST | `/sales` | staff+ | See 5.3 |
| GET | `/sales` | admin (staff: own, today only) | |
| GET | `/sales/:id` | admin or the seller | Receipt data |
| POST | `/sales/:id/void` | admin | Required reason; restocks items |
| GET | `/reports/summary?range=` | admin | Today/7d/30d/custom |
| GET | `/reports/top-products`, `/reports/by-staff` | admin | |
| GET | `/reports/export.csv` | admin | CSV export (escape formula characters, see 7.9) |
| POST | `/uploads/:kind` | admin (avatar: self) | kind: `logo` / `cover` / `product` / `avatar` |
| GET | `/media/:key` | see 7.8 | Served from R2 via Worker |
| GET | `/audit` | owner/admin | Paginated audit log |
| POST | `/products/import` | admin | Chunk of 200–500 rows, upsert by SKU, enforces `maxProducts` (Phase 3.5) |
| GET | `/export/:kind.(csv\|xlsx)` | admin | kind: `products` / `stock` / `movements` / `sales`; streamed (Phase 3.5) |
| GET | `/backup` | owner/admin | Full shop backup download (Phase 3.5) |
| POST | `/backup/restore` | owner/admin | Restore through the import flow; confirmation + audit log (Phase 3.5) |
| GET/POST | `/reports/daily-close` | admin | View / close a day; closed days are read-only (Section 7.16) |
| GET | `/public/s/:slug` | public, cached | Storefront data only (see 9) |

### 5.3 Creating a sale (the most important endpoint)

Request from the client contains **only**: `idempotencyKey`, `items: [{ productId, quantity }]`, `paymentMethod`, `cashReceivedCents?`, `discountCents?` (admin-configurable cap), `clientCreatedAt?`.

Server steps:
1. If a sale with this `(shop_id, idempotency_key)` already exists → return it (safe retry).
2. Load all products **by ID and `shop_id`**, not archived. Reject unknown IDs.
3. Compute prices, line totals, subtotal, discount and total **on the server** from database prices.
4. If cash, verify `cashReceivedCents >= total`; compute change.
5. Run **one D1 `batch()`** (all-or-nothing transaction):
   - `INSERT` sale (number = next per shop),
   - `INSERT` sale_items,
   - `UPDATE products SET stock = stock - ? WHERE id = ? AND shop_id = ?` for tracked items (the `CHECK (stock >= 0)` constraint makes the whole batch fail if anything would oversell),
   - `INSERT` stock_movements (`reason = 'sale'`).
6. On a CHECK failure, return `409 STOCK_INSUFFICIENT` naming the product(s).
7. Return the receipt.

---

## 6. Design system and customization

### 6.0 Brand direction

- **Personality: simple and clean.** Minimal, calm, no clutter. No gradients or decorative effects in the core app.
- **One brand accent color for BLS itself** (the app's own screens: login, signup, app chrome, logo). Shops still customize their own theme as described in 6.2–6.4; the BLS accent never changes with a shop's theme. Options, all checked as white text on the color (WCAG 2.2: 4.5:1 needed for normal text). **Chosen by the owner (2026-10-29): A. Bilis Blue `#1E6FD9`.**

  | Option | Hex | White text contrast | Feel |
  |---|---|---|---|
  | **A. Bilis Blue (chosen)** | `#1E6FD9` | 4.85 : 1 (AA) | bright, friendly, trustworthy |
  | B. Deep Blue | `#1D4ED8` | 6.70 : 1 (AA, near AAA) | calmer, more "bank-like" |
  | C. Emerald | `#047857` | 5.48 : 1 (AA) | fresh, money/growth, stands apart from blue apps |

- **Speed is the brand promise:** every core action should feel instant. Keep the performance budgets in Section 11 and add: **product search results in under 100 ms on a mid-range phone for 5,000 products.**

### 6.1 Design principles

- **Professional and calm:** clean layout, generous spacing, rounded corners (12px cards), soft shadows, one accent color.
- **Speed-first:** the sell screen loads under 1 second on a mid-range phone; big tap targets (min 44×44px); never more than 2 taps to add an item.
- **Responsive:** phone = bottom tab bar + full-width sell grid; tablet/PC = sidebar + split view (products left, cart right).
- **Accessible:** WCAG 2.2 AA contrast, keyboard navigation, visible focus rings, screen-reader labels, respects `prefers-reduced-motion`.
- **Typography:** Inter (UI) by default; shops may choose from a short list (Inter, Poppins, DM Sans, Lora, Space Grotesk). Load from a font CDN or self-host in `/public`.
- **Numbers:** tabular figures for prices; currency formatted with `Intl.NumberFormat` (e.g. `₱1,250.00`).

### 6.2 Theme engine

Shop theme is stored as JSON and validated by Zod:

```ts
export const ThemeSchema = z.object({
  brand: z.string().regex(/^#[0-9a-fA-F]{6}$/),       // from color wheel or preset
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  mode: z.enum(['light', 'dark', 'system']).default('system'),
  font: z.enum(['inter', 'poppins', 'dm-sans', 'lora', 'space-grotesk']).default('inter'),
  radius: z.enum(['sharp', 'soft', 'round']).default('soft'),
  coverOverlay: z.number().min(0).max(0.8).default(0.35),   // darkens cover so text stays readable
  presetId: z.string().max(40).optional(),
}).strict();
```

- **Palette generation:** convert `brand` to OKLCH with `culori` and generate shades 50–950. Write them to CSS variables (`--brand-50 … --brand-950`, `--primary`, `--primary-foreground`, `--ring`) on `:root` for that shop.
- **Contrast guard:** automatically choose white or near-black text on the brand color, whichever passes AA. If the chosen color can't reach AA for buttons, darken/lighten it slightly and tell the user ("We adjusted your color slightly so text stays readable").
- **Never inject raw user CSS.** Only the validated values above become CSS variables.

### 6.3 Presets (one tap)

| Preset | Brand | Mood |
|---|---|---|
| Café Mocha | `#8B5E3C` | warm, cozy |
| Fresh Market | `#2E9E5B` | grocery, sari-sari |
| Ocean Retail | `#1E6FD9` | clean retail |
| Bubble Tea | `#E5679B` | playful drinks |
| Midnight Bar | `#5B4BDB` | night, dark mode default |
| Sunset Food | `#F06A27` | food stalls |
| Salon Blush | `#C2577A` | salons, beauty |
| Classic Mono | `#27272A` | minimal |

### 6.4 Branding screen

- Live preview panel showing the sell screen, a button, a card and the storefront header updating instantly.
- Color: tabs for **Presets** | **Color wheel** (react-colorful + hex input) | **Pick from logo** (extract dominant colors from the uploaded logo in the browser).
- Cover photo: upload → crop (16:5 desktop, 16:9 mobile safe area) → compress → upload. Overlay slider.
- Logo: square crop, 512×512.
- Reset to default button.

### 6.5 Key screens

1. **Sign up / Log in:** branded with BLS POS and the BLS logo; login asks shop code (slug), username, password.
2. **Setup wizard** (Section 8).
3. **Sell (Staff home):** search bar, category chips, product tiles (photo, name, price, stock badge), cart drawer/panel, big **Charge ₱X** button, cash keypad with quick amounts (exact, ₱100, ₱500, ₱1000), change display, receipt screen with "New sale".
4. **Inventory:** list with stock badges (green / amber low / red out), quick "Deduct" with reason picker; admins see "Restock".
5. **Products (Admin):** table on PC, cards on phone; add/edit form with image.
6. **Dashboard (Admin home):** cover photo header with logo and shop name; KPI cards (Today's sales, Transactions, Avg. sale, Gross profit); income chart (7/30 days); top products; sales by staff; low-stock list; recent activity.
7. **Staff:** list, add staff (username + temporary password shown once), deactivate, reset password.
8. **My Profile:** avatar, display name, password, 2FA, active sessions.
9. **Shop settings:** details, branding, storefront, export data, danger zone (owner only).
10. **Help center.**
11. **Public storefront** (Section 9).

---

## 7. Security requirements (non-negotiable)

### 7.1 Passwords
- Hash with **PBKDF2-HMAC-SHA256 via WebCrypto**, 16-byte random salt per user, plus a **server-side pepper** (secret stored with `wrangler secret`). Workers cap PBKDF2 iterations (currently 100,000), so use the maximum allowed and store the iteration count in the hash string so it can be raised later. Check current Workers limits during Phase 1.
- Minimum 10 characters for owner/admin, 8 for staff. Check against a small built-in list of common passwords. No forced complexity rules beyond that.
- Compare hashes in constant time.

### 7.2 Sessions
- 32 random bytes from `crypto.getRandomValues`, sent as cookie `__Host-bls_session` with `HttpOnly; Secure; SameSite=Lax; Path=/`.
- Store only the **SHA-256 hash** of the token in D1.
- Idle timeout 12 hours for staff devices, absolute expiry 30 days; refresh `last_seen_at` at most every 5 minutes.
- Revoke all sessions on: password change, staff deactivation, role change, owner request ("log out all devices").
- **Never** store tokens in localStorage.

### 7.3 Login protection
- Rate limit by IP hash and by `shop+username` (e.g. 5 attempts per 15 minutes) using `login_attempts`.
- Lock the account for 15 minutes after 10 failures; notify admins in the app.
- **Turnstile** always on signup and recovery; on login after 3 failures.
- Same generic error for wrong username or wrong password.

### 7.4 Authorization and tenant isolation
- `shopId` comes **only** from the session.
- Every query includes `WHERE shop_id = ?`. Add a lint/test rule: every service function takes `shopId` as its first argument.
- Role checks on the server for every route. The UI hiding buttons is only for convenience.
- Staff responses never include `cost_cents`, profit, other staff's sales, or audit logs.
- Admins cannot promote anyone to owner or modify the owner.

### 7.5 Input and output
- Zod validation on every input, `.strict()` objects, max lengths on all strings.
- Drizzle/prepared statements only. **No string-built SQL.**
- React escapes output by default; **never** use `dangerouslySetInnerHTML` with user content.
- Shop bio and names are plain text only (no HTML/markdown rendering in Free).

### 7.6 HTTP security headers
```
Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin
```
(Add font CDN origins to CSP only if not self-hosting fonts.)

### 7.7 CSRF
- Same-origin app + `SameSite=Lax` cookie + Origin header check on every state-changing request.

### 7.8 File uploads
- Allowed: JPEG, PNG, WebP only. **No SVG** (can contain scripts).
- Client compresses to WebP (max 1600px wide for covers, 800px for products, 512px for logos/avatars).
- Server checks: size ≤ 2 MB, **magic bytes** match the type, re-generates the key as `shops/{shopId}/{kind}/{randomId}.webp` (never uses the user's filename).
- Serve via the Worker with the stored `Content-Type`, `X-Content-Type-Options: nosniff`, and `Content-Disposition: inline`. Private assets (avatars) require a session from the same shop; storefront assets are public only when the storefront is enabled.
- Enforce the plan's `maxImagesMB` per shop.

### 7.9 CSV export
- Prefix any cell starting with `=`, `+`, `-`, `@`, tab or carriage return with `'` to prevent spreadsheet formula injection.

### 7.10 Secrets and configuration
- All secrets via `wrangler secret put` (`PEPPER`, `TURNSTILE_SECRET`, `TOTP_ENC_KEY`). Never in the repo. `.dev.vars` is git-ignored.
- GitHub secret scanning and Dependabot on.

### 7.11 Two-factor authentication (optional, Free)
- TOTP (RFC 6238) for owner/admin; secret encrypted with AES-GCM using `TOTP_ENC_KEY`.
- Owners are prompted (not forced) to enable it during onboarding.

### 7.12 Account recovery without email (Free)
- At signup the owner receives **10 one-time recovery codes** (shown once, with Download/Print buttons). Stored hashed.
- Staff passwords are reset by an admin.
- Email reset arrives with the Paid NotificationAdapter.

### 7.13 Audit log
Log: logins (success/fail), password/2FA changes, staff create/deactivate/role change, product price changes, archive, restock, deduct, sale void, theme/storefront changes, data exports. Never log secrets.

### 7.14 Backups and data rights
- Nightly Cron Trigger exports each shop's data (JSON) to a private R2 path; keep 14 days.
- Note D1's built-in Time Travel restore window in `docs/LIMITS.md`.
- Owners can **export all shop data** and **delete the shop** (soft delete → hard delete after 30 days).
- Privacy policy and terms pages, written with the Philippine Data Privacy Act (RA 10173) in mind. Collect the minimum personal data.

### 7.15 Testing security
- Automated tests that prove: Shop A cannot read or change Shop B's data through any endpoint; staff cannot call any admin endpoint; client-sent prices are ignored; concurrent sales of the last item never produce negative stock; duplicate idempotency keys never create two sales.

### 7.16 BIR-ready design
- BLS is **not BIR-accredited** yet. Never claim accreditation. Until accreditation is granted, every receipt is clearly labeled as **not an official invoice**. *TODO: exact wording to be confirmed by a tax professional.*
- Sale numbers are **sequential per shop, never reused or edited**. Voided sales keep their number.
- **Daily close report** (Z-reading style): totals, voids, payment breakdown, first and last sale number, stored in `daily_closings`. A closed day cannot be edited.
- The audit log is **tamper-evident**: each entry stores the hash of the previous entry for that shop (hash chain), so a changed or deleted entry is detectable.
- Add a note in `docs/ROADMAP.md`: "Before selling BLS to other businesses, consult a tax professional about BIR accreditation (CRM/POS/sales software) and the e-invoicing rules, including RMC No. 110-2026."

---

## 8. Onboarding and tutorials

### 8.1 Setup wizard (after signup, resumable via `onboarding_step`)
1. **Welcome:** shop name, business type (sets preset categories and a suggested theme).
2. **Look & feel:** preset or color wheel, logo, cover photo (all skippable).
3. **First products:** quick-add 3 products, or "Add sample products" based on business type (removable later).
4. **Your team:** add staff now or later; show the shop code and a printable "How to log in" card for staff.
5. **Security:** save recovery codes (required to continue), optional 2FA.
6. **Done:** "Make your first test sale" button.

### 8.2 Guided tours (driver.js)
- **Owner/Admin tour:** dashboard → products → restock → staff → branding → storefront.
- **Staff tour:** sell screen → search → cart → charge → deduct stock.
- Runs once per user; replay from the Help menu.

### 8.3 Help center
- In-app articles as bundled markdown rendered to plain components: Getting started, Selling, Inventory, Staff, Branding, Storefront, Install on your phone, Offline mode, Security tips, FAQ.
- Empty states everywhere teach the next action ("No products yet — add your first product").

### 8.4 Installing on devices
- Help article and in-app prompt with steps for Android (Chrome → Install app) and iPhone (Safari → Share → Add to Home Screen).

---

## 9. Public storefront (social-style shop profile)

- URL: `/s/:slug`. Off by default; owner turns it on.
- Shows: cover photo, logo, name, bio, business type, optional product showcase (photo, name, price if enabled, "Available"/"Sold out" if stock display enabled).
- Never shows: cost, exact stock (unless enabled), staff, sales, or any internal data.
- **Share** button with copy-link and a downloadable **QR code** for the counter or social media posts.
- Cached at the edge for 60 seconds; cache purged on update.
- Rate limited; slugs reserved list (`admin`, `api`, `login`, etc.).
- Paid later: online ordering, reviews, custom domain.

---

## 10. PWA and offline selling

- Installable PWA with manifest using the shop's name, brand color and icon (default BLS icon if no logo; PWA name "BLS POS", short name "BLS").
- Offline app shell and cached product list (refreshed on each online load).
- **Offline sales:** saved to IndexedDB with an idempotency key and `clientCreatedAt`. Shown with an "Unsynced" badge.
- Sync on reconnect, oldest first. If the server rejects a sale (e.g. stock ran out), keep it in a **"Needs review"** list for an admin to resolve. Never silently drop a sale.
- Clear online/offline indicator in the header.
- Offline data is cleared on logout. Do not cache reports or admin data offline.

---

## 11. Quality, performance and DevOps

- **TypeScript strict**, ESLint, Prettier; CI fails on any error.
- **Tests:** Vitest (services + API in the Workers runtime), Playwright (signup → wizard → add product → sell → dashboard; staff permissions; offline sale sync).
- **Performance budgets:** initial JS ≤ 200 KB gzipped for the sell screen; route-level code splitting; images lazy-loaded.
- **Environments:** `local` (wrangler dev + local D1), `preview` (per-PR), `production`.
- **CI/CD:** GitHub Actions → lint, typecheck, test, apply D1 migrations, deploy with `wrangler deploy` on `main`.
- **Versioning:** SemVer tags; `CHANGELOG.md` generated from Conventional Commits.
- **Docs:** `docs/DEPLOY_FREE.md` explains how anyone can self-host BLS for free:
  1. Create a free Cloudflare account.
  2. `pnpm i` → `wrangler login`.
  3. `wrangler d1 create bls-pos` and `wrangler r2 bucket create bls-pos-media`; paste IDs into `wrangler.jsonc`.
  4. Create a Turnstile widget; set secrets with `wrangler secret put`.
  5. `pnpm db:migrate:prod` → `pnpm deploy`.
  6. Open the URL and sign up as the first owner.

---

## 12. Phases and dated commit plan

**Start:** January 16, 2027 · **v1.0.0 (Free) target:** July 1, 2027 · Pace: part-time, about 3–4 commits per week. (Phase 3.5 was inserted after Phase 3; every commit from Phase 4 on moved +12 days.)

Each phase ends with: all tests passing, docs updated, and a short demo note in `docs/PROGRESS.md`. If a phase slips, move the later dates — do not cut security work.

### Phase 0 — Foundation (Jan 16 – Jan 24, 2027)
**Goal:** a deployable "Hello BLS" with CI.
| Date | Commit |
|---|---|
| 2027-01-16 | `chore: initialize repository with README, LICENSE, .gitignore, .editorconfig` |
| 2027-01-17 | `chore: set up pnpm, TypeScript strict config, ESLint and Prettier` |
| 2027-01-19 | `chore: scaffold React + Vite client with Tailwind and shadcn/ui` |
| 2027-01-20 | `chore: scaffold Hono worker serving API and static assets via wrangler` |
| 2027-01-22 | `ci: add GitHub Actions for lint, typecheck and tests` |
| 2027-01-23 | `docs: add LIMITS.md with verified Cloudflare free-tier limits` |
| 2027-01-24 | `docs: add ARCHITECTURE, SECURITY and ROADMAP skeletons` |

**Done when:** `pnpm dev` runs locally, a preview deploy works, CI is green.

### Phase 1 — Database and authentication (Jan 26 – Feb 9)
| Date | Commit |
|---|---|
| 2027-01-26 | `feat(db): add Drizzle schema for shops, users and sessions` |
| 2027-01-27 | `feat(db): add migrations and local seed script` |
| 2027-01-29 | `feat(auth): add PBKDF2 password hashing with salt and pepper` |
| 2027-01-31 | `feat(auth): add owner signup that creates shop and owner account` |
| 2027-02-02 | `feat(auth): add login, logout and secure session cookies` |
| 2027-02-03 | `feat(auth): add login rate limiting and temporary lockout` |
| 2027-02-05 | `feat(auth): verify Turnstile on signup, recovery and repeated logins` |
| 2027-02-06 | `feat(auth): add one-time recovery codes for owner password reset` |
| 2027-02-08 | `test(auth): cover hashing, sessions, lockout and recovery` |
| 2027-02-09 | `feat(web): add signup and login pages` |

**Done when:** an owner can sign up, log in, log out and recover a password; brute-force attempts are blocked.

### Phase 2 — Tenancy, roles and staff (Feb 11 – Feb 21)
| Date | Commit |
|---|---|
| 2027-02-11 | `feat(api): add tenant middleware deriving shop from session` |
| 2027-02-12 | `feat(api): add role guard middleware for owner, admin and staff` |
| 2027-02-14 | `feat(staff): let admins create staff accounts with temporary passwords` |
| 2027-02-16 | `feat(staff): deactivate staff and revoke their sessions` |
| 2027-02-17 | `feat(audit): add audit log for sensitive actions` |
| 2027-02-19 | `test(security): add tenant isolation and role permission tests` |
| 2027-02-21 | `feat(web): add app shell with role-based navigation` |

**Done when:** two test shops cannot see each other's data; staff are blocked from admin routes (proven by tests).

### Phase 3 — Products and inventory (Feb 23 – Mar 9)
| Date | Commit |
|---|---|
| 2027-02-23 | `feat(db): add categories, products and stock_movements schema` |
| 2027-02-24 | `feat(products): add admin product CRUD API with validation` |
| 2027-02-26 | `feat(products): add categories and product archiving` |
| 2027-02-28 | `feat(storage): add R2 storage adapter with validated image uploads` |
| 2027-03-02 | `feat(inventory): add admin restock and staff deduct with reasons` |
| 2027-03-03 | `feat(inventory): add low-stock thresholds and alerts` |
| 2027-03-05 | `feat(web): add product list with search and category filters` |
| 2027-03-07 | `feat(web): add product form with client-side image compression` |
| 2027-03-09 | `test(inventory): cover stock movements and permission rules` |

**Done when:** admins manage products with photos; staff can deduct stock with a reason; every change is logged.

### Phase 3.5 — Bulk import, export and backup (Mar 10 – Mar 21)
**Goal:** a shop can load its whole catalog on day one.

- Import products from **CSV or Excel (.xlsx)**, or rows pasted from Google Sheets.
- Parse the file **on the device in a Web Worker** (SheetJS for .xlsx, Papa Parse for CSV) so the page never freezes.
- Downloadable **template file** with the exact columns: `name, sku, category, price, cost, stock, low_stock_threshold, track_stock`.
- **Validate every row before saving** and show an error preview ("Row 214: price is missing"), editable in place.
- **Upsert by SKU:** re-importing the same file updates products instead of duplicating them.
- Send rows to the server in **chunks of 200–500** with a progress bar, using D1 `batch()`. Stay inside Cloudflare free-tier CPU and request limits; check them in `docs/LIMITS.md`.
- Enforce the plan's `maxProducts` on the server.
- **Bulk image upload:** drag in many photos, matched to products by file name (`SKU.jpg`), compressed on the device, uploaded in the background with retries.
- **Export** products, stock, stock movements and sales as CSV or .xlsx, streamed so thousands of rows don't time out. Keep the CSV formula-injection protection (Section 7.9).
- **Full shop backup** download (JSON or zip) and **restore** through the same import flow (admin/owner only, with a confirmation and an audit log entry).
- **Target:** importing 5,000 products completes without errors or timeouts on a normal connection.

| Date | Commit |
|---|---|
| 2027-03-10 | `feat(import): add CSV/XLSX template and Web Worker parser` |
| 2027-03-11 | `feat(import): add row validation and editable error preview` |
| 2027-03-13 | `feat(import): add chunked bulk upsert by SKU with progress` |
| 2027-03-15 | `feat(import): add bulk image upload matched by file name` |
| 2027-03-17 | `feat(export): add streamed CSV/XLSX export` |
| 2027-03-19 | `feat(backup): add full shop backup download and restore` |
| 2027-03-21 | `test(import): cover 5,000-row import, duplicates, bad rows and restore` |

**Done when:** a 5,000-row file imports without errors or timeouts; re-importing it updates instead of duplicating; a backup restores into an empty shop.

### Phase 4 — Selling (Mar 23 – Apr 8)
| Date | Commit |
|---|---|
| 2027-03-23 | `feat(db): add sales and sale_items schema with stock CHECK constraint` |
| 2027-03-25 | `feat(sales): add atomic sale creation with server-side pricing` |
| 2027-03-26 | `feat(sales): add idempotency keys to prevent duplicate sales` |
| 2027-03-28 | `feat(payments): add payment adapter with cash and manual methods` |
| 2027-03-30 | `feat(sales): add admin sale voiding with reason and restock` |
| 2027-04-01 | `feat(web): add sell screen with product grid and cart` |
| 2027-04-02 | `feat(web): add cash checkout with quick amounts and change` |
| 2027-04-04 | `feat(web): add receipt view with print support` |
| 2027-04-06 | `feat(web): add SKU search and barcode scanner input` |
| 2027-04-08 | `test(sales): cover concurrent oversell, voids and duplicate submits` |

**Done when:** a cashier completes a sale in under 10 seconds; overselling and duplicate sales are impossible.

### Phase 5 — Dashboard and reports (Apr 10 – Apr 22)
| Date | Commit |
|---|---|
| 2027-04-10 | `feat(reports): add daily summary cron in shop timezone` |
| 2027-04-12 | `feat(reports): add income by day, week and month` |
| 2027-04-14 | `feat(reports): add top products and sales by staff` |
| 2027-04-16 | `feat(web): add admin dashboard with KPI cards and charts` |
| 2027-04-18 | `feat(web): add staff shift view of own sales today` |
| 2027-04-20 | `feat(reports): add CSV export with formula-injection protection` |
| 2027-04-21 | `feat(reports): add daily close report with locked totals` |
| 2027-04-22 | `test(reports): verify totals, timezones and voided sales` |

**Done when:** dashboard totals match sales data exactly, including voids, in the shop's timezone.

### Phase 6 — Branding and storefront (Apr 24 – May 8)
| Date | Commit |
|---|---|
| 2027-04-24 | `feat(theme): add theme schema and OKLCH palette generator` |
| 2027-04-26 | `feat(theme): add automatic contrast checking` |
| 2027-04-27 | `feat(web): add color wheel and presets with live preview` |
| 2027-04-29 | `feat(web): add cover photo and logo upload with cropping` |
| 2027-05-01 | `feat(web): add dark mode and font choices` |
| 2027-05-03 | `feat(profile): add user avatars and display names` |
| 2027-05-05 | `feat(storefront): add public shop profile page` |
| 2027-05-06 | `feat(storefront): add visibility settings and reserved slugs` |
| 2027-05-08 | `feat(storefront): add share link and QR code` |

**Done when:** each shop looks like its own brand everywhere and has a shareable public page that leaks no internal data.

### Phase 7 — Onboarding and help (May 10 – May 20)
| Date | Commit |
|---|---|
| 2027-05-10 | `feat(onboarding): add setup wizard steps for shop and branding` |
| 2027-05-12 | `feat(onboarding): add wizard steps for products, staff and security` |
| 2027-05-14 | `feat(onboarding): add business-type presets and sample products` |
| 2027-05-16 | `feat(tour): add guided tour for owners and admins` |
| 2027-05-17 | `feat(tour): add guided tour for staff` |
| 2027-05-19 | `feat(help): add in-app help center` |
| 2027-05-20 | `docs: add free self-hosting deployment guide` |

**Done when:** a new owner goes from signup to first sale in under 10 minutes without outside help.

### Phase 8 — PWA and offline (May 22 – Jun 1)
| Date | Commit |
|---|---|
| 2027-05-22 | `feat(pwa): add manifest, icons and service worker` (PNG icon sizes generated from `bls-logo.svg`) |
| 2027-05-24 | `feat(pwa): cache app shell and product list` |
| 2027-05-26 | `feat(offline): queue sales in IndexedDB while offline` |
| 2027-05-28 | `feat(offline): sync queued sales and add needs-review list` |
| 2027-05-30 | `feat(web): add online and offline status indicator` |
| 2027-06-01 | `test(offline): cover offline sale, sync and conflict handling` |

**Done when:** sales made with no internet appear in the dashboard after reconnecting, with no duplicates.

### Phase 9 — Security hardening (Jun 3 – Jun 17)
| Date | Commit |
|---|---|
| 2027-06-03 | `feat(security): add CSP and security headers` |
| 2027-06-05 | `feat(security): add origin check for state-changing requests` |
| 2027-06-06 | `feat(auth): add optional TOTP two-factor for owners and admins` |
| 2027-06-08 | `feat(auth): add active sessions page and log out all devices` |
| 2027-06-10 | `chore(security): enable Dependabot, secret scanning and dependency audit` |
| 2027-06-12 | `feat(backup): add nightly backup export to R2` |
| 2027-06-13 | `feat(audit): add hash-chained tamper-evident audit log` |
| 2027-06-14 | `test(e2e): add Playwright tests for critical flows` |
| 2027-06-16 | `docs(security): add threat model and review checklist` |
| 2027-06-17 | `fix(security): resolve findings from security review` |

**Done when:** every item in Section 7 is implemented and checked off in `docs/SECURITY.md`.

### Phase 10 — Polish and launch (Jun 19 – Jul 1)
| Date | Commit |
|---|---|
| 2027-06-19 | `perf: reduce bundle size and lazy-load routes` |
| 2027-06-21 | `feat(a11y): complete accessibility pass` |
| 2027-06-23 | `feat(legal): add privacy policy, terms, data export and shop deletion` |
| 2027-06-25 | `chore: configure production environment` |
| 2027-06-27 | `chore(release): v1.0.0-rc.1 for pilot shops` |
| 2027-06-29 | `fix: address pilot shop feedback` |
| 2027-07-01 | `chore(release): v1.0.0` |

**Done when:** 2–3 real pilot shops have used it for at least a few days without blocking issues.

---

## 13. Paid edition roadmap (later — do NOT build in Phases 0–10)

The customer-facing Paid product is called **"BLS Shop"**. Tentative, starting after v1.0.0 (July 2027 onward). Each item plugs into an adapter or entitlement already prepared above.

| Phase | Feature | Uses |
|---|---|---|
| 11 | Subscriptions & billing (plans Pro/Business, invoices) | `plan`, entitlements, new `subscriptions` table |
| 12 | Online & e-wallet payments (GCash, Maya, cards via a payment provider) | `PaymentAdapter` |
| 13 | Email/SMS receipts, email password reset, low-stock alerts | `NotificationAdapter` |
| 14 | Multiple branches and stock transfers | `branches` table, multi-shop users |
| 15 | Customers & loyalty points | `customers` table |
| 16 | Advanced reports, longer history, scheduled report emails | entitlements |
| 17 | AI insights (sales summaries, reorder suggestions) and AI setup assistant | `AiAdapter` |
| 18 | Online ordering on the storefront, custom domains | storefront |
| 19 | Public API keys and webhooks for integrations | `api_keys`, `webhooks` |

---

## 14. Definition of done (every feature)

- [ ] Works on a phone (360px wide) and a PC.
- [ ] Server checks session, shop and role.
- [ ] Inputs validated with Zod on the server.
- [ ] Tests written (including a "wrong shop" and "wrong role" test where relevant).
- [ ] Sensitive action written to the audit log.
- [ ] Empty, loading and error states designed.
- [ ] Accessible (labels, contrast, keyboard).
- [ ] Docs/help updated.
- [ ] Conventional Commit message.

---

**Start now with Phase 0, commit 2027-01-16.** Before writing code, confirm the stack versions and current Cloudflare free-tier limits, then proceed one commit at a time.
