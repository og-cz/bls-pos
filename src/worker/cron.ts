import { getDb } from './db/client';
import { purgeDeletedShops } from './purge';
import { summaryStatement } from './services/summaries';
import { addDays, localDay } from '@shared/time';

/**
 * Nightly job (Cron Trigger, wrangler.jsonc). Recomputes the last two local days for every
 * shop, one statement per timezone and day, all in one D1 batch, so it stays far inside
 * the free plan's 10 ms CPU per run. Today and yesterday are always computed live by the
 * reports, so a missed run only delays older days.
 */
export async function runNightly(env: Env, now: number = Date.now()): Promise<void> {
  const db = getDb(env.DB);
  const zones = await env.DB.prepare(
    'SELECT DISTINCT timezone FROM shops WHERE deleted_at IS NULL',
  ).all<{
    timezone: string;
  }>();
  const statements = zones.results.flatMap(({ timezone }) => {
    const yesterday = addDays(localDay(now, timezone), -1);
    return [yesterday, addDays(yesterday, -1)].map((day) =>
      summaryStatement(db, { timeZone: timezone }, day, timezone),
    );
  });
  if (statements.length) await env.DB.batch(statements);
  await purgeDeletedShops(env, now);
}
