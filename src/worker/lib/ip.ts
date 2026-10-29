import type { HonoRequest } from 'hono';

import { hashIp } from '../security/tokens';

/** The visitor's IP as a keyed hash (never stored raw), or null outside Cloudflare. */
export async function clientIpHash(c: {
  req: HonoRequest;
  env: { PEPPER: string };
}): Promise<string | null> {
  const ip = c.req.header('cf-connecting-ip');
  return ip ? hashIp(ip, c.env.PEPPER) : null;
}
