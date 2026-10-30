import { and, eq } from 'drizzle-orm';

import type { DailyCloseView, DailyClosing, ZReading } from '@shared/schemas/reports';
import { addDays, dayStartMs, localDay } from '@shared/time';

import type { Db } from '../db/client';
import { isUniqueViolation } from '../db/errors';
import { newId } from '../db/id';
import { dailyClosings, users } from '../db/schema';
import type { Actor } from '../lib/actor';
import { ApiError } from '../lib/errors';
import { auditStatement } from './audit';
import { shopTimeZone } from './reports';

/**
 * The Z-reading columns for the shop's sales in [?2, ?3): first and last sale number
 * (voided ones included: numbers are never skipped), completed and voided totals, and
 * completed sales per payment method as JSON.
 */
const READING = `
  min(s.number) AS first_sale_number,
  max(s.number) AS last_sale_number,
  coalesce(sum(s.status = 'completed'), 0) AS sales_count,
  coalesce(sum(CASE WHEN s.status = 'completed' THEN s.total_cents END), 0) AS gross_cents,
  coalesce(sum(s.status = 'voided'), 0) AS voided_count,
  coalesce(sum(CASE WHEN s.status = 'voided' THEN s.total_cents END), 0) AS voided_cents,
  (SELECT coalesce(json_group_object(m, json_object('count', n, 'cents', c)), '{}')
   FROM (SELECT payment_method AS m, count(*) AS n, sum(total_cents) AS c
         FROM sales WHERE shop_id = ?1 AND created_at >= ?2 AND created_at < ?3
           AND status = 'completed'
         GROUP BY payment_method)) AS payments_json`;

const WHERE = 's.shop_id = ?1 AND s.created_at >= ?2 AND s.created_at < ?3';

type ReadingRow = {
  first_sale_number: number | null;
  last_sale_number: number | null;
  sales_count: number;
  gross_cents: number;
  voided_count: number;
  voided_cents: number;
  payments_json: string;
};

function toReading(day: string, r: ReadingRow): ZReading {
  return {
    day,
    firstSaleNumber: r.first_sale_number,
    lastSaleNumber: r.last_sale_number,
    salesCount: r.sales_count,
    grossCents: r.gross_cents,
    voidedCount: r.voided_count,
    voidedCents: r.voided_cents,
    payments: JSON.parse(r.payments_json) as ZReading['payments'],
  };
}

async function findClosing(db: Db, shopId: string, day: string): Promise<DailyClosing | null> {
  const row = await db
    .select({ c: dailyClosings, name: users.displayName })
    .from(dailyClosings)
    .innerJoin(users, eq(users.id, dailyClosings.closedBy))
    .where(and(eq(dailyClosings.shopId, shopId), eq(dailyClosings.day, day)))
    .get();
  if (!row) return null;
  const { c } = row;
  return {
    ...toReading(day, {
      first_sale_number: c.firstSaleNumber,
      last_sale_number: c.lastSaleNumber,
      sales_count: c.salesCount,
      gross_cents: c.grossCents,
      voided_count: c.voidedCount,
      voided_cents: c.voidedCents,
      payments_json: c.paymentsJson,
    }),
    closedBy: { id: c.closedBy, displayName: row.name },
    closedAt: c.closedAt,
  };
}

/** A day's close if it has one, else its live Z-reading. Defaults to today. */
export async function getDailyClose(
  db: Db,
  shopId: string,
  day: string | undefined,
  now: number = Date.now(),
): Promise<DailyCloseView> {
  const timeZone = await shopTimeZone(db, shopId);
  const today = localDay(now, timeZone);
  const d = day ?? today;
  const closing = await findClosing(db, shopId, d);
  if (closing) return { today, closing, preview: null };
  const row = await db.$client
    .prepare(`SELECT ${READING} FROM sales s WHERE ${WHERE}`)
    .bind(shopId, dayStartMs(d, timeZone), dayStartMs(addDays(d, 1), timeZone))
    .first<ReadingRow>();
  if (!row) throw new ApiError(500, 'INTERNAL', 'Could not read the day.');
  return { today, closing: null, preview: toReading(d, row) };
}

/**
 * Closes a day (Section 7.16). The totals are computed and stored by one INSERT…SELECT,
 * so a sale landing at the same moment is either counted or refused, never lost. From
 * then on database triggers refuse new sales and voids in that day, and any change to
 * the closing itself. Today can be closed (end of shift); future days cannot.
 */
export async function closeDay(
  db: Db,
  shopId: string,
  actor: Actor,
  day: string,
  now: number = Date.now(),
): Promise<DailyClosing> {
  const timeZone = await shopTimeZone(db, shopId);
  if (day > localDay(now, timeZone)) {
    throw new ApiError(400, 'FUTURE_DAY', 'You can only close today or an earlier day.');
  }
  const start = dayStartMs(day, timeZone);
  const end = dayStartMs(addDays(day, 1), timeZone);
  try {
    await db.$client.batch([
      db.$client
        .prepare(
          `INSERT INTO daily_closings (id, shop_id, day, start_ms, end_ms, first_sale_number,
             last_sale_number, sales_count, gross_cents, voided_count, voided_cents,
             payments_json, closed_by, closed_at)
           SELECT ?4, ?1, ?5, ?2, ?3, first_sale_number, last_sale_number, sales_count,
             gross_cents, voided_count, voided_cents, payments_json, ?6, ?7
           FROM (SELECT ${READING} FROM sales s WHERE ${WHERE})`,
        )
        .bind(shopId, start, end, newId(now), day, actor.userId, now),
      auditStatement(
        db,
        shopId,
        {
          action: 'day.close',
          userId: actor.userId,
          target: { type: 'day', id: day },
          details: { day },
          ipHash: actor.ipHash,
        },
        now,
      ),
    ]);
  } catch (err) {
    if (isUniqueViolation(err, 'daily_closings.')) {
      throw new ApiError(409, 'ALREADY_CLOSED', 'This day is already closed.');
    }
    throw err;
  }
  const closing = await findClosing(db, shopId, day);
  if (!closing) throw new ApiError(500, 'INTERNAL', 'Could not close the day.');
  return closing;
}
