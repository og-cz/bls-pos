import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import { API_BASE, APP_NAME } from '@shared/app';

import type { AppEnv } from './env';
import { ApiError } from './lib/errors';
import { session } from './middleware/session';
import { auditRoutes } from './routes/audit';
import { authRoutes } from './routes/auth';
import { categoryRoutes } from './routes/categories';
import { meRoutes } from './routes/me';
import { productRoutes } from './routes/products';
import { staffRoutes } from './routes/staff';

export type { AppEnv };

const app = new Hono<AppEnv>().basePath(API_BASE);

// JSON bodies are capped at 64 KB (Section 5.1). Uploads get their own limit later.
app.use(
  bodyLimit({
    maxSize: 64 * 1024,
    onError: (c) =>
      c.json({ error: { code: 'BODY_TOO_LARGE', message: 'Request body is too large.' } }, 413),
  }),
);

app.use(session);

app.get('/health', (c) => c.json({ ok: true, name: APP_NAME }));
app.route('/auth', authRoutes);
app.route('/me', meRoutes);
app.route('/staff', staffRoutes);
app.route('/audit', auditRoutes);
app.route('/products', productRoutes);
app.route('/categories', categoryRoutes);

app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404));

// Never leak stack traces or SQL to the client (Section 5).
app.onError((err, c) => {
  if (err instanceof ApiError) return c.json(err.toBody(), err.status);
  console.error(err);
  return c.json({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, 500);
});

export default app;
