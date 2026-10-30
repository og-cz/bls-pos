import { fileURLToPath, URL } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// API tests run inside the real Workers runtime (workerd via Miniflare).
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          PEPPER: 'test-pepper',
          // Tests mock the siteverify call; this value is never sent anywhere.
          TURNSTILE_SECRET: 'test-turnstile-secret',
          // 32 zero bytes: a test-only key for two-step login secrets.
          TOTP_ENC_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
          TEST_MIGRATIONS: await readD1Migrations(
            fileURLToPath(new URL('./migrations', import.meta.url)),
          ),
        },
      },
    })),
  ],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  test: {
    include: ['tests/api/**/*.test.ts'],
    setupFiles: ['./tests/api/setup.ts'],
  },
});
