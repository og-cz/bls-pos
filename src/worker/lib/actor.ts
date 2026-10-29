import type { Context } from 'hono';

import type { Role } from '@shared/roles';

import type { AuthedEnv } from '../env';
import { clientIpHash } from './ip';

/** The signed-in person doing an action, for permission checks and the audit log. */
export type Actor = { userId: string; role: Role; ipHash: string | null };

export async function actorOf(c: Context<AuthedEnv>): Promise<Actor> {
  return { userId: c.var.auth.userId, role: c.var.auth.role, ipHash: await clientIpHash(c) };
}
