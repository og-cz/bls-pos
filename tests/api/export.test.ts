import { describe, expect, it } from 'vitest';

import { exportFileName, safeCell, safeRows } from '../../src/shared/export';
import { addMember, getWithCookie, postJson, signUp } from './helpers';

describe('safeCell (formula-injection protection)', () => {
  it('neutralises text a spreadsheet would run as a formula', () => {
    for (const bad of ['=HYPERLINK("x")', '+1+1', '-2+3', '@SUM(A1)', '\tx', '\rx']) {
      expect(safeCell(bad)).toBe(`'${bad}`);
    }
  });

  it('leaves normal text, numbers and empty cells alone', () => {
    expect(safeCell('Spark plug')).toBe('Spark plug');
    expect(safeCell('a=b')).toBe('a=b');
    expect(safeCell(-3)).toBe(-3);
    expect(safeCell(null)).toBeNull();
    expect(safeRows([['=x', 5]])).toEqual([["'=x", 5]]);
  });

  it('names files after the shop, the kind and the date', () => {
    expect(exportFileName('aling-nenas', 'products', 'csv', new Date('2026-10-30T10:00:00Z'))).toBe(
      'aling-nenas-products-2026-10-30.csv',
    );
  });
});

describe('POST /audit/exports', () => {
  it('records an export in the activity log', async () => {
    const owner = await signUp();
    const res = await postJson(
      '/audit/exports',
      { kind: 'products', format: 'xlsx', rows: 120 },
      owner.cookie,
    );
    expect(res.status).toBe(200);
    const audit = await (
      await getWithCookie('/audit', owner.cookie)
    ).json<{
      entries: { action: string; details: unknown }[];
    }>();
    expect(audit.entries[0]).toMatchObject({
      action: 'data.export',
      details: { kind: 'products', format: 'xlsx', rows: 120 },
    });
  });

  it('is for admins and the owner, with known kinds only', async () => {
    const owner = await signUp();
    const staff = await addMember(owner, 'staff');
    expect(
      (await postJson('/audit/exports', { kind: 'products', format: 'csv', rows: 1 }, staff.cookie))
        .status,
    ).toBe(403);
    expect(
      (await postJson('/audit/exports', { kind: 'users', format: 'csv', rows: 1 }, owner.cookie))
        .status,
    ).toBe(400);
  });
});
