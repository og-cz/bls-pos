import { describe, expect, it } from 'vitest';

import { BACKUP_FORMAT, backupToImport, type Backup } from '../../src/shared/backup';
import { checkRows } from '../../src/shared/import-validate';
import { addMember, getWithCookie, postJson, signUp } from './helpers';

const backup: Backup = {
  format: BACKUP_FORMAT,
  version: 1,
  exportedAt: '2026-10-30T00:00:00.000Z',
  shop: { name: 'Moto Shop', slug: 'moto', currency: 'PHP' },
  categories: ['Engine'],
  products: [
    {
      name: 'Spark plug',
      sku: 'SP-1',
      category: 'Engine',
      priceCents: 12_050,
      costCents: 8_000,
      trackStock: true,
      stock: 40,
      lowStockThreshold: 5,
      archived: false,
    },
    {
      name: 'Labor',
      sku: null,
      category: null,
      priceCents: 30_000,
      costCents: null,
      trackStock: false,
      stock: 0,
      lowStockThreshold: 5,
      archived: false,
    },
    {
      name: 'Old part',
      sku: 'OLD',
      category: null,
      priceCents: 100,
      costCents: null,
      trackStock: true,
      stock: 1,
      lowStockThreshold: 5,
      archived: true,
    },
  ],
  movements: [],
};

describe('backupToImport', () => {
  it('turns products into import rows that pass the same checks, skipping archived ones', () => {
    const { result } = backupToImport(JSON.parse(JSON.stringify(backup)));
    expect(result.rows.map((r) => r.values.name)).toEqual(['Spark plug', 'Labor']);
    expect(result.rows[0]?.values).toMatchObject({ price: '120.50', cost: '80.00', stock: '40' });
    const checked = checkRows(result.rows);
    expect(checked.every((r) => r.check.ok)).toBe(true);
    expect(checked[0]?.check).toMatchObject({ ok: true, product: { priceCents: 12_050 } });
    expect(checked[1]?.check).toMatchObject({ ok: true, product: { trackStock: false } });
  });

  it('refuses files that are not backups, or from a newer version', () => {
    expect(() => backupToImport({ hello: 1 })).toThrow("isn't a bls POS backup");
    expect(() => backupToImport({ ...backup, version: 99 })).toThrow('newer version');
  });
});

describe('POST /audit/restores', () => {
  it('records a restore in the activity log, for admins and the owner only', async () => {
    const owner = await signUp();
    expect((await postJson('/audit/restores', { products: 2 }, owner.cookie)).status).toBe(200);
    const audit = await (
      await getWithCookie('/audit', owner.cookie)
    ).json<{
      entries: { action: string; details: unknown }[];
    }>();
    expect(audit.entries[0]).toMatchObject({ action: 'data.restore', details: { products: 2 } });
    const staff = await addMember(owner, 'staff');
    expect((await postJson('/audit/restores', { products: 2 }, staff.cookie)).status).toBe(403);
  });
});
