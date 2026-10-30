import { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';

import { useMe } from '@/app/session';
import { FormAlert, TextField } from '@/components/field';
import { Button } from '@/components/ui/button';
import { ApiClientError, apiPost } from '@/lib/api';
import { BUSINESS_LABEL } from '@shared/business';
import { parseAmountToCents } from '@shared/money';

import { StepLayout, type StepProps } from './StepLayout';

type Row = { name: string; price: string; stock: string };
const EMPTY: Row = { name: '', price: '', stock: '' };
const PLACEHOLDERS = ['Engine oil 1L', 'Iced latte', 'Haircut'];

/** Step 3: add the first few products (more later, or import a spreadsheet). */
export function ProductsStep({ onNext, busy }: StepProps) {
  const [rows, setRows] = useState<Row[]>([EMPTY, EMPTY, EMPTY]);
  const { shop } = useMe();
  const [error, setError] = useState<string | null>(null);
  const [samples, setSamples] = useState<'idle' | 'adding' | 'added'>('idle');
  const filled = rows.filter((r) => r.name.trim() !== '');

  function set(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function save() {
    for (const r of filled) {
      const name = r.name.trim();
      const priceCents = parseAmountToCents(r.price);
      if (priceCents === null) throw new Error(`Enter a price for ${name}, like 120 or 99.50.`);
      const stock = r.stock.trim() === '' ? null : Number(r.stock);
      if (stock !== null && (!Number.isInteger(stock) || stock < 0)) {
        throw new Error(`Stock for ${name} must be a whole number.`);
      }
      // No stock count = a made-to-order item that is never "out of stock".
      await apiPost('/products', {
        name,
        priceCents,
        trackStock: stock !== null,
        ...(stock !== null ? { stock } : {}),
      });
    }
    setRows([EMPTY, EMPTY, EMPTY]);
  }

  return (
    <StepLayout
      title="Add your first products"
      description="Just a few to start selling. Leave stock empty for things made to order. Add photos and more products later, or import a spreadsheet."
      busy={busy}
      nextLabel={
        filled.length
          ? `Add ${String(filled.length)} and continue`
          : samples === 'added'
            ? 'Continue'
            : 'Skip for now'
      }
      next={() => {
        setError(null);
        onNext(async () => {
          try {
            await save();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not add the products.');
            throw err;
          }
        });
      }}
    >
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_6rem_5rem] gap-2 sm:grid-cols-[1fr_8rem_6rem]"
          >
            <TextField
              label={i === 0 ? 'Product name' : `Product ${String(i + 1)}`}
              value={r.name}
              maxLength={120}
              placeholder={PLACEHOLDERS[i]}
              onChange={(e) => {
                set(i, { name: e.target.value });
              }}
            />
            <TextField
              label="Price"
              inputMode="decimal"
              className="tabular"
              value={r.price}
              onChange={(e) => {
                set(i, { price: e.target.value });
              }}
            />
            <TextField
              label="Stock"
              inputMode="numeric"
              className="tabular"
              value={r.stock}
              onChange={(e) => {
                set(i, { stock: e.target.value });
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-4">
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium">Just trying it out?</div>
          <div className="text-muted-foreground">
            {shop.businessType === 'other'
              ? 'Add a few sample products to try a sale.'
              : `Add a few sample products for a ${BUSINESS_LABEL[shop.businessType].toLowerCase()}.`}{' '}
            Remove them any time from Products.
          </div>
        </div>
        {samples === 'added' ? (
          <span role="status" className="flex items-center gap-1 text-sm font-medium">
            <Check className="size-4 text-primary" aria-hidden="true" /> Sample products added
          </span>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={samples === 'adding' || busy}
            onClick={() => {
              setSamples('adding');
              setError(null);
              apiPost('/shop/samples')
                .then(() => {
                  setSamples('added');
                })
                .catch((err: unknown) => {
                  if (err instanceof ApiClientError && err.status === 409) {
                    setSamples('added');
                    return;
                  }
                  setSamples('idle');
                  setError(err instanceof Error ? err.message : 'Could not add samples.');
                });
            }}
          >
            <Sparkles aria-hidden="true" />
            Add sample products
          </Button>
        )}
      </div>
      {error ? <FormAlert>{error}</FormAlert> : null}
    </StepLayout>
  );
}
