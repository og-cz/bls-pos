import { useState } from 'react';
import { DropdownMenu } from 'radix-ui';
import { Download } from 'lucide-react';

import { useMe } from '@/app/session';
import { FormAlert } from '@/components/field';
import { Button } from '@/components/ui/button';
import { apiGet, apiPost } from '@/lib/api';
import { exportFileName, type Cell, type ExportFormat, type ExportKind } from '@shared/export';
import type { CategoryDto } from '@shared/schemas/categories';
import type { MovementDto } from '@shared/schemas/inventory';
import type { ProductDto } from '@shared/schemas/products';

import { useImportWorker } from './use-import-worker';

const pesos = (cents: number | null | undefined) => (cents == null ? null : cents / 100);

async function allProducts(): Promise<ProductDto[]> {
  const out: ProductDto[] = [];
  let cursor: string | null = null;
  do {
    const q: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const page: { products: ProductDto[]; nextCursor: string | null } = await apiGet(
      `/products?limit=100${q}`,
    );
    out.push(...page.products);
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

async function allMovements(): Promise<MovementDto[]> {
  const out: MovementDto[] = [];
  let cursor: string | null = null;
  do {
    const q: string = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const page: { movements: MovementDto[]; nextCursor: string | null } = await apiGet(
      `/inventory/movements?limit=100${q}`,
    );
    out.push(...page.movements);
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

/** Rows for each kind of export, header first. Prices in pesos, as people read them. */
async function rowsFor(kind: ExportKind): Promise<Cell[][]> {
  if (kind === 'movements') {
    const moves = await allMovements();
    return [
      ['date', 'product', 'change', 'reason', 'note', 'by'],
      ...moves.map((m) => [
        new Date(m.createdAt).toISOString(),
        m.product.name,
        m.delta,
        m.reason,
        m.note,
        m.user.displayName,
      ]),
    ];
  }
  const [products, { categories }] = await Promise.all([
    allProducts(),
    apiGet<{ categories: CategoryDto[] }>('/categories'),
  ]);
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  if (kind === 'stock') {
    return [
      ['name', 'sku', 'category', 'stock', 'low_stock_threshold', 'status'],
      ...products
        .filter((p) => p.trackStock)
        .map((p) => [
          p.name,
          p.sku,
          p.categoryId ? (cat.get(p.categoryId) ?? null) : null,
          p.stock,
          p.lowStockThreshold,
          p.stockStatus,
        ]),
    ];
  }
  // Same columns as the import template, so an export can be edited and imported back.
  return [
    ['name', 'sku', 'category', 'price', 'cost', 'stock', 'low_stock_threshold', 'track_stock'],
    ...products.map((p) => [
      p.name,
      p.sku,
      p.categoryId ? (cat.get(p.categoryId) ?? null) : null,
      pesos(p.priceCents),
      pesos(p.costCents),
      p.trackStock ? p.stock : null,
      p.lowStockThreshold,
      p.trackStock ? 'yes' : 'no',
    ]),
  ];
}

const KINDS: { kind: ExportKind; label: string; sheet: string }[] = [
  { kind: 'products', label: 'Products (re-importable)', sheet: 'Products' },
  { kind: 'stock', label: 'Stock levels', sheet: 'Stock' },
  { kind: 'movements', label: 'Stock movements', sheet: 'Movements' },
];

/** Products/stock/movements as CSV or Excel (admins and the owner). */
export function ExportMenu() {
  const { shop } = useMe();
  const { downloadRows } = useImportWorker();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportAs(kind: ExportKind, format: ExportFormat, sheet: string) {
    setBusy(true);
    setError(null);
    try {
      const rows = await rowsFor(kind);
      await apiPost('/audit/exports', { kind, format, rows: rows.length - 1 });
      await downloadRows({
        type: 'export',
        format,
        rows,
        sheet,
        filename: exportFileName(shop.slug, kind, format),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="outline" disabled={busy}>
            <Download aria-hidden="true" />
            {busy ? 'Exporting…' : 'Export'}
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 min-w-60 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {KINDS.map(({ kind, label, sheet }) => (
              <div key={kind}>
                <DropdownMenu.Label className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                  {label}
                </DropdownMenu.Label>
                {(['xlsx', 'csv'] as const).map((format) => (
                  <DropdownMenu.Item
                    key={format}
                    onSelect={() => void exportAs(kind, format, sheet)}
                    className="flex min-h-11 cursor-pointer items-center rounded-md px-3 text-sm outline-none data-[highlighted]:bg-accent"
                  >
                    {format === 'xlsx' ? 'Excel (.xlsx)' : 'CSV'}
                  </DropdownMenu.Item>
                ))}
              </div>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {error ? <FormAlert>{error}</FormAlert> : null}
    </>
  );
}
