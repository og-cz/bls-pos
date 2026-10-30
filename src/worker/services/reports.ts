import { and, between, eq } from 'drizzle-orm';

import type {
  IncomeBucket,
  IncomeQuery,
  IncomeReport,
  IncomeTotals,
  ReportGroup,
} from '@shared/schemas/reports';
import { addDays, dayStartMs, daysBetween, localDay } from '@shared/time';

import type { Db } from '../db/client';
import { dailySummaries, shops } from '../db/schema';
import { ApiError } from '../lib/errors';
import { SUMMARY_COLUMNS } from './summaries';

type DayTotals = Omit<IncomeTotals, 'profitCents'>;

const ZERO: DayTotals = { salesCount: 0, grossCents: 0, voidedCents: 0, costCents: 0 };

export async function shopTimeZone(db: Db, shopId: string): Promise<string> {
  const shop = await db
    .select({ timezone: shops.timezone })
    .from(shops)
    .where(eq(shops.id, shopId))
    .get();
  if (!shop) throw new ApiError(404, 'NOT_FOUND', 'Shop not found.');
  return shop.timezone;
}

/**
 * Totals per local day. Days up to the day before yesterday come from `daily_summaries`
 * (written by the nightly cron). Today, yesterday and any day the cron has not written are
 * computed from the sales in one query: each day's UTC window goes in as one JSON
 * parameter, so this works for any timezone, DST included, in three queries in all.
 */
export async function dailyTotals(
  db: Db,
  shopId: string,
  from: string,
  to: string,
  timeZone: string,
  now: number = Date.now(),
): Promise<Map<string, DayTotals>> {
  const today = localDay(now, timeZone);
  const last = to < today ? to : today;
  const out = new Map<string, DayTotals>();
  if (from > last) return out;

  const storedUntil = addDays(today, -2);
  if (from <= storedUntil) {
    const rows = await db
      .select()
      .from(dailySummaries)
      .where(
        and(
          eq(dailySummaries.shopId, shopId),
          between(dailySummaries.day, from, last < storedUntil ? last : storedUntil),
        ),
      )
      .all();
    for (const r of rows) {
      out.set(r.day, {
        salesCount: r.salesCount,
        grossCents: r.grossCents,
        voidedCents: r.voidedCents,
        costCents: r.costCents,
      });
    }
  }

  const live = daysBetween(from, last)
    .filter((d) => !out.has(d))
    .map((d) => ({ d, s: dayStartMs(d, timeZone), e: dayStartMs(addDays(d, 1), timeZone) }));
  if (live.length) {
    const { results } = await db.$client
      .prepare(
        `SELECT json_extract(w.value, '$.d') AS day, ${SUMMARY_COLUMNS}
         FROM json_each(?2) w
         JOIN sales s ON s.shop_id = ?1
           AND s.created_at >= json_extract(w.value, '$.s')
           AND s.created_at < json_extract(w.value, '$.e')
         GROUP BY day`,
      )
      .bind(shopId, JSON.stringify(live))
      .all<{
        day: string;
        sales_count: number;
        gross_cents: number;
        voided_cents: number;
        cost_cents: number;
      }>();
    for (const r of results) {
      out.set(r.day, {
        salesCount: r.sales_count,
        grossCents: r.gross_cents,
        voidedCents: r.voided_cents,
        costCents: r.cost_cents,
      });
    }
  }
  return out;
}

/** The bucket a day falls in: itself, the Monday of its week, or its month. */
function bucketKey(day: string, group: ReportGroup): string {
  if (group === 'day') return day;
  if (group === 'month') return day.slice(0, 7);
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7));
}

function withProfit(t: DayTotals): IncomeTotals {
  return { ...t, profitCents: t.grossCents - t.costCents };
}

/** Income by day, week or month (Section 5.6), with every period present, zero or not. */
export async function incomeReport(
  db: Db,
  shopId: string,
  query: IncomeQuery,
  now: number = Date.now(),
): Promise<IncomeReport> {
  const timeZone = await shopTimeZone(db, shopId);
  const days = await dailyTotals(db, shopId, query.from, query.to, timeZone, now);

  const buckets = new Map<string, IncomeBucket>();
  const sum = { ...ZERO };
  for (const day of daysBetween(query.from, query.to)) {
    const key = bucketKey(day, query.group);
    let b = buckets.get(key);
    if (!b) {
      b = { key, from: day, to: day, ...withProfit(ZERO) };
      buckets.set(key, b);
    }
    b.to = day;
    const t = days.get(day);
    if (!t) continue;
    for (const k of Object.keys(ZERO) as (keyof DayTotals)[]) {
      b[k] += t[k];
      sum[k] += t[k];
    }
    b.profitCents = b.grossCents - b.costCents;
  }

  return {
    timeZone,
    today: localDay(now, timeZone),
    group: query.group,
    buckets: [...buckets.values()],
    totals: withProfit(sum),
  };
}
