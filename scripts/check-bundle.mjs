// Performance budget (Section 11): the JavaScript a phone downloads to open a screen,
// gzipped. The sell screen must stay at or under 200 KB. Run after `pnpm build`.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const DIST = 'dist/client';
const BUDGET_KB = 200;
const manifest = JSON.parse(readFileSync(`${DIST}/.vite/manifest.json`, 'utf8'));

const sizes = new Map();
function gzKb(file) {
  if (!sizes.has(file)) {
    sizes.set(file, gzipSync(readFileSync(`${DIST}/${file}`), { level: 9 }).length / 1024);
  }
  return sizes.get(file);
}

/** A chunk and everything it imports statically (loaded together). */
function closure(key, seen = new Set()) {
  if (seen.has(key)) return seen;
  seen.add(key);
  for (const dep of manifest[key]?.imports ?? []) closure(dep, seen);
  return seen;
}

const entry = closure('index.html');
const screens = {
  Sell: 'src/client/features/sell/SellPage.tsx',
  Dashboard: 'src/client/features/dashboard/DashboardPage.tsx',
  Login: 'src/client/features/auth/LoginPage.tsx',
  'Shop page (public)': 'src/client/features/storefront/StorefrontPage.tsx',
};

let failed = false;
for (const [name, key] of Object.entries(screens)) {
  if (!manifest[key]) throw new Error(`Not in the manifest: ${key}`);
  const files = new Set([...entry, ...closure(key)].map((k) => manifest[k].file));
  const kb = [...files].filter((f) => f.endsWith('.js')).reduce((n, f) => n + gzKb(f), 0);
  const over = name === 'Sell' && kb > BUDGET_KB;
  failed ||= over;
  console.log(
    `${over ? 'OVER' : 'ok  '} ${name.padEnd(20)} ${kb.toFixed(1).padStart(6)} KB gzipped`,
  );
}
if (failed) {
  console.error(`The sell screen is over its ${BUDGET_KB} KB budget.`);
  process.exit(1);
}
