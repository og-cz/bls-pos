import { useState } from 'react';
import { Banknote, Delete, Smartphone } from 'lucide-react';

import { FormAlert } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMe } from '@/app/session';
import { ApiClientError, apiPost } from '@/lib/api';
import { queuePut } from '@/lib/offline-store';
import { cn } from '@/lib/utils';
import type { Cart } from '@shared/cart';
import { applyKey, quickCashAmounts } from '@shared/checkout';
import { formatCents, parseAmountToCents } from '@shared/money';
import type { ProductDto } from '@shared/schemas/products';
import type { Receipt } from '@shared/schemas/sales';

type Props = {
  cart: Cart;
  /** The products in the cart, for an offline receipt. */
  products: Map<string, ProductDto>;
  totalCents: number;
  currency: string;
  /** `offline`: kept on this device, sent when the connection is back. */
  onSold: (receipt: Receipt, offline: boolean) => void;
  /** Stock changed under us (another till sold the last one): refresh the products. */
  onStockChanged: () => void;
};

/** A fresh idempotency key for one checkout (Section 5.3), reused on every retry of it. */
function newSaleKey(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/** What the customer gets while offline: number 0 = numbered when it reaches the server. */
function offlineReceipt(
  body: { idempotencyKey: string; paymentMethod: string; clientCreatedAt: number } & {
    cashReceivedCents?: number;
    paymentReference?: string;
  },
  cart: Cart,
  products: Map<string, ProductDto>,
  totalCents: number,
  user: { id: string; displayName: string },
): Receipt {
  return {
    id: `offline-${body.idempotencyKey}`,
    number: 0,
    status: 'completed',
    createdAt: body.clientCreatedAt,
    cashier: { id: user.id, displayName: user.displayName },
    lines: cart.map((l) => {
      const p = products.get(l.productId);
      const unit = p?.priceCents ?? 0;
      return {
        productId: l.productId,
        name: p?.name ?? 'Item',
        quantity: l.quantity,
        unitPriceCents: unit,
        lineTotalCents: unit * l.quantity,
      };
    }),
    subtotalCents: totalCents,
    discountCents: 0,
    totalCents,
    paymentMethod: body.paymentMethod,
    paymentReference: body.paymentReference ?? null,
    cashReceivedCents: body.cashReceivedCents ?? null,
    changeCents: body.cashReceivedCents !== undefined ? body.cashReceivedCents - totalCents : null,
    voidReason: null,
  };
}

/** The device's clock, kept with offline sales (`clientCreatedAt`). */
const deviceTime = () => Date.now();

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'] as const;

/**
 * Checkout (Section 6.5): the total, Cash with quick amounts, a keypad and the change, or
 * Other (manual) with a reference. One sale key per checkout, reused on every retry, so a
 * double tap or a dropped connection can never record the sale twice.
 */
export function Checkout({ cart, products, totalCents, currency, onSold, onStockChanged }: Props) {
  const { user } = useMe();
  const money = (c: number) => formatCents(c, currency);
  const [saleKey] = useState(newSaleKey);
  const [method, setMethod] = useState<'cash' | 'other_manual'>('cash');
  const [typed, setTyped] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const received = typed === '' ? totalCents : parseAmountToCents(typed);
  const short = method === 'cash' && (received === null || received < totalCents);
  const change = method === 'cash' && received !== null && !short ? received - totalCents : 0;

  async function complete() {
    if (short || busy) return;
    setBusy(true);
    setError(null);
    const body = {
      idempotencyKey: saleKey,
      items: cart,
      paymentMethod: method,
      clientCreatedAt: deviceTime(),
      ...(method === 'cash' ? { cashReceivedCents: received ?? totalCents } : {}),
      ...(method === 'other_manual' && reference.trim()
        ? { paymentReference: reference.trim() }
        : {}),
    };
    try {
      const { receipt } = await apiPost<{ receipt: Receipt }>('/sales', body);
      onSold(receipt, false);
    } catch (err) {
      // No connection: keep the sale on this device and finish (Section 10). It is sent
      // with the same key later, so it can never be recorded twice.
      if (err instanceof ApiClientError && err.code === 'NETWORK') {
        try {
          await queuePut({
            key: saleKey,
            body,
            totalCents,
            itemCount: cart.reduce((n, l) => n + l.quantity, 0),
            createdAt: body.clientCreatedAt,
            status: 'pending',
            error: null,
            userId: user.id,
          });
          onSold(offlineReceipt(body, cart, products, totalCents, user), true);
          return;
        } catch {
          // Storage unavailable: fall through to the retry message.
        }
      }
      if (err instanceof ApiClientError && err.code === 'STOCK_INSUFFICIENT') onStockChanged();
      setError(
        err instanceof ApiClientError && err.code === 'NETWORK'
          ? 'No connection. Tap Complete again; the sale will not be recorded twice.'
          : err instanceof Error
            ? err.message
            : 'Something went wrong.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="text-sm text-muted-foreground">Total</div>
        <div className="text-4xl font-bold tabular">{money(totalCents)}</div>
      </div>

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment method">
        {(
          [
            ['cash', 'Cash', Banknote],
            ['other_manual', 'Other', Smartphone],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={method === id}
            onClick={() => {
              setMethod(id);
            }}
            className={cn(
              'flex h-12 items-center justify-center gap-2 rounded-lg border font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              method === id
                ? 'border-primary bg-primary/10 text-primary'
                : 'bg-card hover:bg-accent',
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {method === 'cash' ? (
        <>
          <div className="flex flex-wrap gap-2">
            {quickCashAmounts(totalCents).map((c) => (
              <Button
                key={c}
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setTyped((c / 100).toFixed(2));
                }}
              >
                {c === totalCents ? 'Exact' : money(c)}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted p-4">
            <div>
              <div className="text-sm text-muted-foreground">Cash received</div>
              <div className="text-2xl font-semibold tabular" aria-live="polite">
                {received === null ? '—' : money(received)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Change</div>
              <div
                className={cn(
                  'text-2xl font-bold tabular',
                  short ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
                )}
                aria-live="polite"
              >
                {short ? 'Not enough' : money(change)}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2" aria-label="Cash keypad">
            {KEYS.map((k) => (
              <Button
                key={k}
                type="button"
                variant="outline"
                className="h-12 text-lg tabular"
                aria-label={k === '⌫' ? 'Delete digit' : k === '.' ? 'Decimal point' : k}
                onClick={() => {
                  setTyped((t) => applyKey(t, k));
                }}
              >
                {k === '⌫' ? <Delete aria-hidden="true" /> : k}
              </Button>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <label htmlFor="payment-ref" className="text-sm font-medium">
            Reference (optional)
          </label>
          <Input
            id="payment-ref"
            placeholder="e.g. GCash reference number"
            maxLength={80}
            value={reference}
            onChange={(e) => {
              setReference(e.target.value);
            }}
          />
          <p className="text-sm text-muted-foreground">
            For payments you confirm yourself, like GCash sent to the shop&apos;s phone.
          </p>
        </div>
      )}

      {error ? <FormAlert>{error}</FormAlert> : null}

      <Button
        type="button"
        size="lg"
        className="h-14 w-full text-lg"
        disabled={short || busy}
        onClick={() => void complete()}
      >
        {busy ? 'Saving…' : 'Complete sale'}
      </Button>
    </div>
  );
}
