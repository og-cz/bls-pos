import type { AuthContext } from './services/sessions';

export type AppEnv = {
  Bindings: Env;
  Variables: { auth: AuthContext | null };
};

/**
 * For routes behind `requireAuth` and `tenant`: the session exists, and `shopId` is the
 * session's shop. It is the only shop a request may touch (Section 5.1 step 5).
 */
export type AuthedEnv = {
  Bindings: Env;
  Variables: { auth: AuthContext; shopId: string };
};
