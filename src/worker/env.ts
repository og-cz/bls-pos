import type { AuthContext } from './services/sessions';

export type AppEnv = {
  Bindings: Env;
  Variables: { auth: AuthContext | null };
};

/** For routes behind requireAuth: the session is guaranteed to exist. */
export type AuthedEnv = {
  Bindings: Env;
  Variables: { auth: AuthContext };
};
