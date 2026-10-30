// Builds the app icons (PWA, Apple touch icon) from public/logo.svg: the white mark on a
// Bilis Blue square. Run with `pnpm icons` after the logo changes; the PNGs are committed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { Resvg } from '@resvg/resvg-js';

const BLUE = '#1E6FD9';
const logo = readFileSync('public/logo.svg', 'utf8');
const viewBox = /viewBox="([^"]+)"/.exec(logo)?.[1] ?? '0 0 100 100';
const paths = logo
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replaceAll('fill="black"', 'fill="#FFFFFF"');

/**
 * `inset` is the share of the square the logo leaves empty on each side. Maskable icons
 * need a bigger margin: launchers may crop them to a circle (safe zone = middle 80%).
 */
function icon(size, { inset, rounded }) {
  const box = size * (1 - inset * 2);
  const radius = rounded ? size * 0.22 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BLUE}"/>
  <svg x="${size * inset}" y="${size * inset}" width="${box}" height="${box}" viewBox="${viewBox}">${paths}</svg>
</svg>`;
}

const outputs = [
  ['icon-192.png', 192, { inset: 0.14, rounded: true }],
  ['icon-512.png', 512, { inset: 0.14, rounded: true }],
  ['icon-maskable-512.png', 512, { inset: 0.24, rounded: false }],
  ['apple-touch-icon.png', 180, { inset: 0.16, rounded: false }],
];

mkdirSync('public/icons', { recursive: true });
for (const [name, size, opts] of outputs) {
  const png = new Resvg(icon(size, opts), { fitTo: { mode: 'width', value: size } })
    .render()
    .asPng();
  writeFileSync(`public/icons/${name}`, png);
  console.log(`public/icons/${name}`);
}
