import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, vi } from 'vitest';

// Every test file starts from a fully migrated, empty database.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

export const VALID_TURNSTILE = 'valid-token';
export const UNREACHABLE_TURNSTILE = 'unreachable';

// No real network in tests. Turnstile's siteverify is simulated:
// 'valid-token' passes, 'unreachable' throws like a network error, anything else fails.
beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      const token = (init?.body as FormData).get('response');
      if (token === UNREACHABLE_TURNSTILE) return Promise.reject(new TypeError('network error'));
      const success = token === VALID_TURNSTILE;
      return Promise.resolve(
        Response.json({ success, 'error-codes': success ? [] : ['invalid-input-response'] }),
      );
    }
    return Promise.reject(new Error(`Unexpected outbound fetch in test: ${url}`));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
