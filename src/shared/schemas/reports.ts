import { z } from 'zod';

/** The longest range one report may cover. */
export const MAX_REPORT_DAYS = 366;

export const REPORT_GROUPS = ['day', 'week', 'month'] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number];

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

/** A range of local days in the shop's timezone, both ends included. */
export const reportRangeSchema = z
  .object({ from: day, to: day })
  .refine((r) => r.from <= r.to, { message: 'From must be on or before To.', path: ['to'] })
  .refine(
    (r) =>
      (Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`)) / 86_400_000 <
      MAX_REPORT_DAYS,
    { message: `Pick at most ${MAX_REPORT_DAYS} days.`, path: ['to'] },
  );

export const incomeQuerySchema = z.intersection(
  reportRangeSchema,
  z.object({ group: z.enum(REPORT_GROUPS).default('day') }),
);

export const TOP_PRODUCT_SORTS = ['revenue', 'quantity'] as const;

export const topProductsQuerySchema = z.intersection(
  reportRangeSchema,
  z.object({
    sort: z.enum(TOP_PRODUCT_SORTS).default('revenue'),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  }),
);

export type ReportRange = z.infer<typeof reportRangeSchema>;
export type TopProductsQuery = z.infer<typeof topProductsQuerySchema>;

export type TopProduct = {
  productId: string;
  name: string;
  quantity: number;
  revenueCents: number;
  profitCents: number;
};

export type StaffSales = {
  userId: string;
  displayName: string;
  username: string;
  active: boolean;
  salesCount: number;
  grossCents: number;
  voidedCount: number;
  voidedCents: number;
};
export type IncomeQuery = z.infer<typeof incomeQuerySchema>;

export type IncomeTotals = {
  salesCount: number;
  grossCents: number;
  voidedCents: number;
  costCents: number;
  profitCents: number;
};

/** One day, week (starting Monday) or month. */
export type IncomeBucket = IncomeTotals & { key: string; from: string; to: string };

export type IncomeReport = {
  timeZone: string;
  today: string;
  group: ReportGroup;
  buckets: IncomeBucket[];
  totals: IncomeTotals;
};
