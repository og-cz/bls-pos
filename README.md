<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.png" />
    <img src="docs/assets/logo-light.png" alt="BLS logo" width="64" valign="middle" />
  </picture>
  BLS (bilis)
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
  <b>BLS. Benta agad.</b><br />
  Instant point-of-sale and inventory for any small business.<br />
  Sign up, brand your shop, add products and staff, and start selling from a phone or PC — free.
</p>

---

BLS (said "bilis", Tagalog for "fast") is built for small shops, cafés, food stalls, salons and retail stores that need
a checkout that is quick to learn, quick to use and costs nothing to run.

> **Status:** early development (Phases 0–2 done, Phase 3 in progress). Not ready for real shops yet.

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
