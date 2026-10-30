import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { CHAIN_START, verifyChain, type ChainEntry } from '../../src/shared/audit-chain';
import { sealAuditLog } from '../../src/worker/audit-seal';
import { sha256Hex } from '../../src/worker/security/tokens';
import { addMember, createProductAs, getWithCookie, signUp } from './helpers';

type Page = { entries: ChainEntry[]; unsealed: number };

async function chain(cookie: string) {
  return (await getWithCookie('/audit/chain', cookie)).json<Page>();
}

/** Seal until nothing is left (other test shops share the table). */
async function sealAll() {
  while ((await sealAuditLog(env)) > 0) {
    // keep going
  }
}

describe('tamper-evident activity log', () => {
  it('seals entries into a chain the browser can check', async () => {
    const owner = await signUp();
    await addMember(owner, 'staff');
    await createProductAs(owner.cookie, { name: 'Oil' });
    expect((await chain(owner.cookie)).unsealed).toBeGreaterThan(0);

    await sealAll();
    const page = await chain(owner.cookie);
    expect(page.unsealed).toBe(0);
    expect(page.entries.map((e) => e.chainSeq)).toEqual(page.entries.map((_, i) => i + 1));
    const result = await verifyChain(sha256Hex, page.entries);
    expect(result).toMatchObject({ ok: true, checked: page.entries.length });

    // Sealing again changes nothing; new entries continue the same chain.
    await sealAll();
    await createProductAs(owner.cookie, { name: 'Spark plug' });
    await sealAll();
    const longer = await chain(owner.cookie);
    expect(longer.entries).toHaveLength(page.entries.length + 1);
    expect(await verifyChain(sha256Hex, longer.entries)).toMatchObject({ ok: true });
  });

  it('a changed entry is caught', async () => {
    const owner = await signUp();
    await createProductAs(owner.cookie, { name: 'Oil', priceCents: 100 });
    await sealAll();
    const { entries } = await chain(owner.cookie);
    const target = entries.find((e) => e.action === 'product.create');
    await env.DB.prepare('UPDATE audit_log SET details_json = ? WHERE id = ?')
      .bind('{"name":"Oil","priceCents":1}', target?.id ?? '')
      .run();
    const result = await verifyChain(sha256Hex, (await chain(owner.cookie)).entries);
    expect(result).toMatchObject({ ok: false, brokenAt: target?.chainSeq, reason: 'changed' });
  });

  it('a removed entry is caught', async () => {
    const owner = await signUp();
    await addMember(owner, 'staff');
    await createProductAs(owner.cookie, { name: 'Oil' });
    await sealAll();
    const { entries } = await chain(owner.cookie);
    const middle = entries[1];
    await env.DB.prepare('DELETE FROM audit_log WHERE id = ?')
      .bind(middle?.id ?? '')
      .run();
    const result = await verifyChain(sha256Hex, (await chain(owner.cookie)).entries);
    expect(result).toMatchObject({ ok: false, brokenAt: 2, reason: 'missing' });
  });

  it('re-hashing a changed entry still breaks the next one', async () => {
    const owner = await signUp();
    await addMember(owner, 'staff');
    await createProductAs(owner.cookie, { name: 'Oil' });
    await sealAll();
    const { entries } = await chain(owner.cookie);
    const first = entries[0];
    if (!first) throw new Error('no entries');
    // An attacker edits entry 1 and recomputes its own hash, but not the rest.
    const forged = { ...first, detailsJson: '{"forged":true}' };
    const { chainHash } = await import('../../src/shared/audit-chain');
    const newHash = await chainHash(sha256Hex, CHAIN_START, forged);
    await env.DB.prepare('UPDATE audit_log SET details_json = ?, chain_hash = ? WHERE id = ?')
      .bind(forged.detailsJson, newHash, first.id)
      .run();
    const result = await verifyChain(sha256Hex, (await chain(owner.cookie)).entries);
    expect(result).toMatchObject({ ok: false, brokenAt: 2, reason: 'changed' });
  });

  it('chains are per shop, and only admins can read them', async () => {
    const a = await signUp();
    const b = await signUp();
    const staff = await addMember(a, 'staff');
    await sealAll();
    const pageA = await chain(a.cookie);
    expect(pageA.entries.every((e) => e.shopId === a.shopId)).toBe(true);
    expect((await chain(b.cookie)).entries[0]?.chainSeq).toBe(1);
    expect((await getWithCookie('/audit/chain', staff.cookie)).status).toBe(403);
  });
});
