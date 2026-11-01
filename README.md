<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.png" />
    <img src="docs/assets/logo-light.png" alt="bls POS logo" width="64" valign="middle" />
  </picture>
  bls POS
</h1>

<p align="center">
  <a href="https://github.com/og-cz/bilis-pos"><img src="https://img.shields.io/github/stars/og-cz/bilis-pos?style=flat&amp;label=%E2%98%85&amp;color=1E6FD9" alt="GitHub stars" /></a>
  <a href="https://github.com/og-cz/bilis-pos/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/og-cz/bilis-pos/ci.yml?branch=main&amp;style=flat&amp;label=CI" alt="CI status" /></a>
  <img src="https://img.shields.io/badge/license-MIT-1E6FD9?style=flat" alt="License: MIT" />
  <img src="https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&amp;logoColor=white" alt="Runs on Cloudflare Workers" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&amp;logoColor=white" alt="Written in TypeScript" />
  <img src="https://img.shields.io/badge/Web%20%7C%20Android%20%7C%20iOS%20%7C%20Windows%20%7C%20macOS-4493F8?style=flat-square" alt="Supported platforms: Web, Android, iOS, Windows and macOS (installable PWA)" />
</p>

<p align="center">
  <b>Instant point-of-sale and inventory for any small business.</b><br />
  Sign up, brand your shop, add products and staff, and start selling from a phone or PC — free.
</p>

---

bls POS is built for small shops, cafés, food stalls, salons and retail stores that need
a checkout that is quick to learn, quick to use and costs nothing to run.

<p align="center">
  <img src="docs/assets/screenshots/dashboard.png" alt="bls POS dashboard: today's sales, sales per day chart, top products and sales by staff" width="900" />
</p>

> **Status:** v1.0.0-rc.1, live and in pilot with the first shops. Screenshots show a demo
> shop with sample data.

## How it works

### 1. Create your shop

The owner signs up with a shop name and a **shop code** (for example `moto-clue`). Staff
log in with that shop code plus their own username and password, so every shop is kept
completely separate. A short setup wizard picks colors, adds the first products and
invites staff. At signup the owner gets one-time **recovery codes** to get back in if the
password is ever forgotten.

### 2. Sell

<p align="center">
  <img src="docs/assets/screenshots/sell.png" alt="Sell screen with product tiles, category filters and a cart" width="900" />
</p>

Tap products to add them to the cart (or search by name or SKU, or scan a barcode), then
**Charge**. For cash, enter what the customer gave and the change is worked out for you.
Prices always come from the server, so a sale can't be tampered with, and stock can never
go below zero. **No internet?** Keep selling: sales are saved on the device and sync
automatically when the connection is back, never twice.

### 3. Products and stock

<p align="center">
  <img src="docs/assets/screenshots/products.png" alt="Products list with photos, prices, cost and stock" width="900" />
</p>

Add products with a price, optional cost, category, SKU and photo. Stock goes down with
every sale; admins **restock**, and staff can **deduct** stock with a reason (damaged,
expired, used, lost). Every change is logged with who, when, how many and why, and
low-stock items are flagged.

Photos are shrunk on the device and saved as **AVIF** (a phone photo of a few MB becomes
roughly 30–90 KB), so they load fast and a shop can hold thousands of them for free.

### 4. Dashboard

The owner and admins see today's sales, number of sales, average sale and gross profit,
compared with yesterday; sales per day for the last 7 or 30 days; top products; sales by
each staff member; and what is running low. Everything can be exported to CSV. Staff see
only their own sales for today.

### 5. Branding

<p align="center">
  <img src="docs/assets/screenshots/branding.png" alt="Branding screen with color presets, light or dark mode, fonts and a live preview" width="900" />
</p>

Each shop looks like its own brand: pick a preset or any color, light or dark mode, font
and corner style, and add a logo and cover photo. The live preview shows the result right
away. Colors are checked automatically so text always stays readable. Shops can also turn
on a public **shop page** with a QR code to share their products.

### 6. Settings

<p align="center">
  <img src="docs/assets/screenshots/settings.png" alt="Settings screen with theme, text size and layout options" width="900" />
</p>

Each phone, tablet or PC keeps its own preferences: theme, larger text, how products are
listed (list, compact list or tiles), and which side the menu opens from. Each person's
**profile** covers their password, two-step login with an authenticator app, and signing
out other devices.

### 7. On a phone

<p align="center">
  <img src="docs/assets/screenshots/phone-sell.png" alt="Sell screen on a phone with a bottom tab bar" width="280" />
  &nbsp;&nbsp;
  <img src="docs/assets/screenshots/phone-dashboard.png" alt="Dashboard on a phone" width="280" />
</p>

The same app works on any screen. On phones the main screens are in a tab bar at the
bottom and the full menu slides in from the side. It can be installed like an app
(Android: Chrome → Install app; iPhone: Safari → Share → Add to Home Screen).

## Who can do what

| Role      | Can do                                                                                   |
| --------- | ---------------------------------------------------------------------------------------- |
| **Owner** | Everything below, plus delete the shop, manage admins and keep the recovery codes        |
| **Admin** | Products, prices, restock, staff, void sales, all reports, branding                      |
| **Staff** | Sell, deduct stock with a reason, view products and stock, see their own sales for today |

Every rule is checked on the server, not just hidden in the screen.

## Your data is safe

- **Sales are never deleted.** A mistake is _voided_ (with a reason and who did it), so
  the history stays complete. Closed days are locked in the database itself.
- **Updates never erase data.** Database changes only ever add tables and columns.
- **Backups:** every shop is backed up nightly (kept 14 days), on top of the database's
  own 7-day point-in-time restore.
- **Only the owner can delete a shop,** by typing the shop code and their password. It is
  hidden at once and only erased for good after 30 days.
- Passwords are salted and hashed, logins are rate-limited with bot protection, and an
  audit log records every sensitive action.

## Stack

Cloudflare Workers (API + static assets), D1 (data, photos and backups), Turnstile ·
Hono · Drizzle · Zod · React + Vite + TypeScript · Tailwind CSS + shadcn/ui · TanStack
Query.

Everything runs on free tiers that allow commercial use and never sleep — no card needed.

## Development

Requirements: Node.js 22+ and pnpm 10+.

```bash
pnpm install
pnpm dev
```

## Self-hosting

Runs free on Cloudflare (Workers and D1). Step-by-step: [docs/DEPLOY_FREE.md](docs/DEPLOY_FREE.md).

## License

[MIT](LICENSE)
