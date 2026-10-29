import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('GET /api/v1/health', () => {
  it('reports the API is up', async () => {
    const res = await exports.default.fetch('https://pos.test/api/v1/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, name: 'BLS POS' });
  });
});

describe('unknown API routes', () => {
  it('return a JSON error without internals', async () => {
    const res = await exports.default.fetch('https://pos.test/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
});
