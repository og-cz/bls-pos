import { z } from 'zod';

import { IMPORT_COLUMNS, type ImportColumn } from '../import';

/** Rows per request. Small enough for the free plan's 10 ms CPU and 50 queries per request. */
export const IMPORT_CHUNK_ROWS = 250;

const cell = z.string().max(200);

export const importChunkSchema = z
  .object({
    rows: z
      .array(
        z
          .object({
            line: z.number().int().min(2).max(1_000_000),
            values: z
              .object(
                Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, cell.default('')])) as Record<
                  ImportColumn,
                  z.ZodDefault<typeof cell>
                >,
              )
              .strict(),
          })
          .strict(),
      )
      .min(1)
      .max(IMPORT_CHUNK_ROWS),
  })
  .strict();

export type ImportChunkInput = z.infer<typeof importChunkSchema>;

export type ImportChunkResult = {
  created: number;
  updated: number;
  /** Rows the server refused, with the reason (the browser checks first, so usually none). */
  skipped: { line: number; message: string }[];
  /** Existing products whose stock cell was ignored: stock changes go through Inventory. */
  stockIgnored: number;
  categoriesCreated: number;
};
