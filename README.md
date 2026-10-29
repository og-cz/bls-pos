# POS Fast

Instant point-of-sale and inventory for any small business — sign up, brand your
shop, add products and staff, and start selling from a phone or PC.

> **Status:** early development (Phase 0 — Foundation). Not ready for real shops yet.

## What it does (Free edition, planned for v1.0)

- Fast sell screen with cart, cash checkout and change calculation
- Products, categories, stock tracking and low-stock alerts
- Every stock change logged with who, when, how many and why
- Live dashboard: income by day/week/month, top products, sales by staff
- Owner / Admin / Staff roles
- Shop branding (colors, logo, cover photo, dark mode) and a public shop page
- Installable app (PWA) with offline selling that syncs later

## Stack

Cloudflare Workers (API + static assets), D1, R2, Turnstile · Hono · Drizzle ·
Zod · React + Vite + TypeScript · Tailwind CSS + shadcn/ui · TanStack Query.

Everything runs on free tiers that allow commercial use and never sleep.

## Development

Requirements: Node.js 22+ and pnpm 10+.

```bash
pnpm install
pnpm dev
```

## License

[MIT](LICENSE)
