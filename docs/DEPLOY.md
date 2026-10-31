# Self-hosting bls POS for free

bls POS runs entirely on Cloudflare's free plan: one Worker (the API and the web app),
one D1 database and one R2 bucket for photos. No server to look after, nothing that
sleeps. This guide takes about 20 minutes the first time.

The free plan's limits, and how far they stretch, are in [LIMITS.md](LIMITS.md).

## What you need

- A Cloudflare account (free). R2 asks for a payment method on file even on the free
  tier; nothing is charged while you stay inside the free limits.
- [Node.js](https://nodejs.org) 22 or newer and [pnpm](https://pnpm.io).
- Git, and this repository.

```bash
git clone https://github.com/og-cz/bilis-pos.git
cd bilis-pos
pnpm install
```

## 1. Log in to Cloudflare

```bash
pnpm exec wrangler login
```

A browser window opens; allow access. Check which account you are on with
`pnpm exec wrangler whoami`.

## 2. Create the database

```bash
pnpm exec wrangler d1 create bls-pos
```

Copy the `database_id` it prints into `wrangler.jsonc`, replacing the zeros in
`d1_databases[0].database_id`. Then create the tables:

```bash
pnpm db:migrate:prod
```

## 3. Create the photo bucket

```bash
pnpm exec wrangler r2 bucket create bls-pos-media
```

## 4. Turn on bot protection (Turnstile)

1. In the Cloudflare dashboard, open **Turnstile** and **Add widget**.
2. Add the domain you will use (your `*.workers.dev` address works).
3. Keep the **site key** (public) and the **secret key** (private).

Put the site key in a file named `.env.production.local` (it is ignored by git):

```bash
VITE_TURNSTILE_SITE_KEY=your-site-key
```

## 5. Set the secrets

Type each value when asked. Never paste secrets into chats, issues or commits.

```bash
pnpm exec wrangler secret put PEPPER
```

For `PEPPER`, use a long random value. Generate one with:

```bash
node -e "console.log(crypto.randomBytes(32).toString('base64'))"
```

Keep a copy somewhere safe: changing it later logs everyone out and makes recovery
codes stop working.

```bash
pnpm exec wrangler secret put TURNSTILE_SECRET
```

`TOTP_ENC_KEY` encrypts two-step login secrets. Generate it the same way as `PEPPER`
(32 random bytes, base64) and keep a copy: losing it turns off everyone's two-step
login.

```bash
pnpm exec wrangler secret put TOTP_ENC_KEY
```

## 6. Deploy

```bash
pnpm deploy
```

It builds the app and prints your address, like `https://bls-pos.<you>.workers.dev`.
Open it, sign up, and the setup guide takes it from there.

## Updating

```bash
git pull
pnpm install
pnpm db:migrate:prod
pnpm deploy
```

Always run the migrations before deploying a new version.

## Your own domain (optional)

In the Cloudflare dashboard, open your Worker → **Settings** → **Domains & Routes** →
**Add** → **Custom domain**. The domain must be on Cloudflare (free). Add it to your
Turnstile widget too.

## Backups

- Owners can download a full backup (JSON) from **Products → Export** at any time.
- D1 also keeps 7 days of point-in-time history on the free plan (Time Travel); restore with
  `pnpm exec wrangler d1 time-travel restore bls-pos --timestamp <time>`.

## Troubleshooting

- **"Verification failed" at signup:** the site key and secret are from different
  widgets, or your domain is not on the widget.
- **Error 1027 / "daily limit":** the 100,000 requests a day are used up; they reset at
  00:00 UTC. See [LIMITS.md](LIMITS.md).
- **Photos don't upload:** check the R2 bucket name matches `wrangler.jsonc`.
