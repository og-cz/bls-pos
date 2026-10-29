import { Hono } from 'hono';

import { API_BASE, APP_NAME } from '@shared/app';

export type AppEnv = { Bindings: Env };

const app = new Hono<AppEnv>().basePath(API_BASE);

app.get('/health', (c) => c.json({ ok: true, name: APP_NAME }));

app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404));

// Never leak stack traces or SQL to the client (Section 5).
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, 500);
});

export default app;
