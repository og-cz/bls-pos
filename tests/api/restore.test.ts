import { describe, expect, it } from 'vitest';

import { BACKUP_FORMAT, backupToImport, type Backup } from '../../src/shared/backup';
import type { ImportChunkResult } from '../../src/shared/schemas/import';
import { createProductAs, getWithCookie, postJson, signUp } from './helpers';

type Product = {
  name: string;
  sku: string | null;
  priceCents: number;
  costCents?: number | null;
  stock: number;
  trackStock: boolean;
  lowStockThreshold: number;
  categoryId: string | null;
  archived: boolean;
};

async function products(cookie: string) {
  return (
    await (await getWithCookie('/products?limit=100', cookie)).json<{ products: Product[] }>()
  ).products;
}

/** The same backup the browser builds, from the API. */
async function backupOf(cookie: string): Promise<Backup> {
  const list = await products(cookie);
  const { categories } = await (
    await getWithCookie('/categories', cookie)
  ).json<{
    categories: { id: string; name: string }[];
  }>();
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    shop: { name: 'X', slug: 'x', currency: 'PHP' },
    categories: categories.map((c) => c.name),
    products: list.map((p) => ({
      name: p.name,
      sku: p.sku,
      category: p.categoryId ? (cat.get(p.categoryId) ?? null) : null,
      priceCents: p.priceCents,
      costCents: p.costCents ?? null,
      trackStock: p.trackStock,
      stock: p.stock,
      lowStockThreshold: p.lowStockThreshold,
      archived: p.archived,
    })),
    movements: [],
  };
}

const comparable = (list: Product[]) =>
  list
    .map((p) => [
      p.name,
      p.sku,
      p.priceCents,
      p.costCents ?? null,
      p.stock,
      p.trackStock,
      p.lowStockThreshold,
    ])
    .sort();

describe('backup and restore', () => {
  it('restores a backup into an empty shop with the same products', async () => {
    const source = await signUp();
    const cat = await postJson('/categories', { name: 'Engine' }, source.cookie);
    const { category } = await cat.json<{ category: { id: string } }>();
    await createProductAs(source.cookie, {
      name: 'Spark plug',
      sku: 'SP-1',
      priceCents: 12_050,
      costCents: 8_000,
      stock: 40,
      lowStockThreshold: 6,
      categoryId: category.id,
    });
    await createProductAs(source.cookie, { name: 'Labor', priceCents: 30_000, trackStock: false });
    await createProductAs(source.cookie, {
      name: 'Oil',
      sku: 'OIL-1',
      priceCents: 45_000,
      stock: 0,
    });

    const backup = backupOf(source.cookie);
    const { result } = backupToImport(JSON.parse(JSON.stringify(await backup)));

    const target = await signUp();
    const res = await postJson('/products/import', { rows: result.rows }, target.cookie);
    expect(res.status).toBe(200);
    expect(await res.json<ImportChunkResult>()).toMatchObject({ created: 3, skipped: [] });

    expect(comparable(await products(target.cookie))).toEqual(
      comparable(await products(source.cookie)),
    );
  });

  it('restoring twice into the same shop updates products with a SKU instead of duplicating them', async () => {
    const owner = await signUp();
    await createProductAs(owner.cookie, {
      name: 'Spark plug',
      sku: 'SP-1',
      priceCents: 100,
      stock: 5,
    });
    const { result } = backupToImport(JSON.parse(JSON.stringify(await backupOf(owner.cookie))));
    await postJson('/products/import', { rows: result.rows }, owner.cookie);
    await postJson('/products/import', { rows: result.rows }, owner.cookie);
    const list = await products(owner.cookie);
    expect(list.filter((p) => p.sku === 'SP-1')).toHaveLength(1);
    expect(list[0]?.stock).toBe(5);
  });
});
