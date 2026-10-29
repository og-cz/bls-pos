import { createMiddleware } from 'hono/factory';

import { hasRole, type Role } from '@shared/roles';

import type { AuthedEnv } from '../env';
import { ApiError } from '../lib/errors';

/**
 * Allows the route for `minimum` and higher roles (Section 5.1 step 6). The role comes
 * from the database via the session, never from the client. Hidden buttons in the UI
 * are only a convenience; this is the check that counts.
 */
export function requireRole(minimum: Role) {
  return createMiddleware<AuthedEnv>(async (c, next) => {
    if (!hasRole(c.var.auth.role, minimum)) {
      throw new ApiError(403, 'FORBIDDEN', "You don't have permission to do that.");
    }
    await next();
  });
}
