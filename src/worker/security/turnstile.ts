import { ApiError } from '../lib/errors';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const TURNSTILE_TOKEN_MAX = 2048;

type SiteverifyResponse = { success: boolean; 'error-codes'?: string[]; action?: string };

/**
 * Verifies a Turnstile token with Cloudflare (Section 7.3). Fails closed: a missing token,
 * a rejected token, or Cloudflare being unreachable all refuse the request.
 */
export async function requireHuman(
  secret: string,
  token: string | undefined,
  remoteIp: string | undefined,
): Promise<void> {
  if (!token) {
    throw new ApiError(403, 'TURNSTILE_REQUIRED', 'Please complete the security check.');
  }

  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (remoteIp) form.append('remoteip', remoteIp);

  let result: SiteverifyResponse;
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(5000),
    });
    result = await res.json<SiteverifyResponse>();
  } catch {
    throw new ApiError(
      503,
      'TURNSTILE_UNAVAILABLE',
      'The security check is unavailable right now. Please try again.',
    );
  }

  if (!result.success) {
    throw new ApiError(
      403,
      'TURNSTILE_FAILED',
      'The security check failed or expired. Please try again.',
    );
  }
}
