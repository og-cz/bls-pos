import { defineConfig } from 'drizzle-kit';

// drizzle-kit only generates SQL here; wrangler applies it to D1 (local or remote).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/worker/db/schema.ts',
  out: './migrations',
});
