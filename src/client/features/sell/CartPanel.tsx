import { ImageOff, Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatCents } from '@shared/money';
import { maxQuantity, type Cart } from '@shared/cart';
import type { ProductDto } from '@shared/schemas/products';

type Props = {
  cart: Cart;
  products: ReadonlyMap<string, ProductDto>;
  currency: string;
  subtotalCents: number;
  items: number;
  onQuantity: (product: ProductDto, quantity: number) => void;
  onClear: () => void;
  onCharge?: (() => void) | undefined;
};

/** The cart: lines with − / + and remove, the total, and the big Charge button. */
export function CartPanel({
  cart,
  products,
  currency,
  subtotalCents,
  items,
  onQuantity,
  onClear,
  onCharge,
}: Props) {
  const money = (c: number) => formatCents(c, currency);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShoppingCart className="size-5" aria-hidden="true" />
          Cart
          {items ? (
            <span className="text-sm font-normal text-muted-foreground">({items})</span>
          ) : null}
        </h2>
        {cart.length ? (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X aria-hidden="true" />
            Clear
          </Button>
        ) : null}
      </div>

      {cart.length === 0 ? (
        <p className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Tap a product to add it.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
          {cart.map((line) => {
            const p = products.get(line.productId);
            if (!p) return null;
            const atMax = line.quantity >= maxQuantity(p);
            return (
              <li key={line.productId} className="flex items-center gap-3 px-4 py-2">
                {(p.thumbUrl ?? p.imageUrl) ? (
                  <img
                    src={p.thumbUrl ?? p.imageUrl ?? ''}
                    alt=""
                    className="size-11 shrink-0 rounded-md bg-muted object-cover"
                  />
                ) : (
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <ImageOff className="size-4" aria-hidden="true" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="text-sm text-muted-foreground tabular">
                    {money(p.priceCents)} × {line.quantity} ={' '}
                    <span className="font-medium text-foreground">
                      {money(p.priceCents * line.quantity)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={line.quantity === 1 ? `Remove ${p.name}` : `One less ${p.name}`}
                    onClick={() => {
                      onQuantity(p, line.quantity - 1);
                    }}
                  >
                    {line.quantity === 1 ? (
                      <Trash2 aria-hidden="true" />
                    ) : (
                      <Minus aria-hidden="true" />
                    )}
                  </Button>
                  <span className="w-8 text-center font-semibold tabular" aria-live="polite">
                    {line.quantity}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={`One more ${p.name}`}
                    disabled={atMax}
                    title={atMax ? 'No more in stock' : undefined}
                    onClick={() => {
                      onQuantity(p, line.quantity + 1);
                    }}
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-3 border-t p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">Total</span>
          <span className="text-2xl font-semibold tabular">{money(subtotalCents)}</span>
        </div>
        {onCharge ? (
          <Button
            size="lg"
            className="h-14 w-full text-lg"
            disabled={cart.length === 0}
            onClick={onCharge}
          >
            Charge {money(subtotalCents)}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
