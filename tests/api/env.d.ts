import type { D1Migration } from 'cloudflare:test';

declare global {
  namespace Cloudflare {
    interface Env {
      // Test-only binding injected by vitest.config.ts.
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
