import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import { API_BASE, APP_NAME } from '@shared/app';

import type { AppEnv } from './env';
import { ApiError } from './lib/errors';
import { session } from './middleware/session';
import { MAX_UPLOAD_BYTES } from './security/images';
import { auditRoutes } from './routes/audit';
import { authRoutes } from './routes/auth';
import { categoryRoutes } from './routes/categories';
import { inventoryRoutes } from './routes/inventory';
import { meRoutes } from './routes/me';
import { productRoutes } from './routes/products';
import { mediaRoutes, uploadRoutes } from './routes/uploads';
import { staffRoutes } from './routes/staff';

export type { AppEnv };

const app = new Hono<AppEnv>().basePath(API_BASE);

// JSON bodies are capped at 64 KB (Section 5.1); image uploads at 2 MB (Section 7.8).
const limit = (maxSize: number, message: string) =>
  bodyLimit({
    maxSize,
    onError: (c) => c.json({ error: { code: 'BODY_TOO_LARGE', message } }, 413),
  });
const jsonLimit = limit(64 * 1024, 'Request body is too large.');
const uploadLimit = limit(MAX_UPLOAD_BYTES, 'Images must be 2 MB or smaller.');
app.use((c, next) =>
  c.req.path.startsWith(`${API_BASE}/uploads/`) ? uploadLimit(c, next) : jsonLimit(c, next),
);

app.use(session);

app.get('/health', (c) => c.json({ ok: true, name: APP_NAME }));
app.route('/auth', authRoutes);
app.route('/me', meRoutes);
app.route('/staff', staffRoutes);
app.route('/audit', auditRoutes);
app.route('/products', productRoutes);
app.route('/categories', categoryRoutes);
app.route('/inventory', inventoryRoutes);
app.route('/uploads', uploadRoutes);
app.route('/media', mediaRoutes);

app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404));

// Never leak stack traces or SQL to the client (Section 5).
app.onError((err, c) => {
  if (err instanceof ApiError) return c.json(err.toBody(), err.status);
  console.error(err);
  return c.json({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, 500);
});

export default app;
