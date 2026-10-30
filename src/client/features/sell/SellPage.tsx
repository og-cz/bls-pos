import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ImageOff, Search, SearchX, ShoppingCart } from 'lucide-react';

import { useMe } from '@/app/session';
import { EmptyState } from '@/components/empty-state';
import { FormAlert } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  addOne,
  cartTotals,
  maxQuantity,
  quantityOf,
  reconcile,
  setQuantity,
  type Cart,
} from '@shared/cart';
import { formatCents } from '@shared/money';
import type { ProductDto } from '@shared/schemas/products';
import type { Receipt } from '@shared/schemas/sales';
import { createScanReader, findBySku } from '@shared/scan';

import { searchKey, useCatalog } from '../products/use-catalog';
import { CartPanel } from './CartPanel';
import { Checkout } from './Checkout';
import { ReceiptView } from './ReceiptView';

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-10 shrink-0 rounded-full border px-4 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
      )}
    >
      {label}
    </button>
  );
}

/** One tap adds one. Big, photo-first tiles (Section 6.5: never more than 2 taps). */
function SellTile({
  product,
  inCart,
  money,
  onAdd,
}: {
  product: ProductDto;
  inCart: number;
  money: (c: number) => string;
  onAdd: () => void;
}) {
  const soldOut = maxQuantity(product) === 0;
  const full = !soldOut && inCart >= maxQuantity(product);
  const photo = product.thumbUrl ?? product.imageUrl;
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={soldOut || full}
      aria-label={`Add ${product.name}, ${money(product.priceCents)}${inCart ? `, ${String(inCart)} in cart` : ''}`}
      className={cn(
        'relative flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-transform outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.97]',
        inCart && 'border-primary ring-1 ring-primary',
        (soldOut || full) && 'opacity-60',
      )}
    >
      <div className="aspect-[4/3] w-full bg-muted">
        {photo ? (
          <img
            src={photo}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-6" aria-hidden="true" />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-2.5">
        <span className="line-clamp-2 text-sm leading-snug font-medium">{product.name}</span>
        <span className="mt-auto font-semibold tabular">{money(product.priceCents)}</span>
        {product.trackStock ? (
          <span
            className={cn(
              'text-xs tabular',
              soldOut ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {soldOut ? 'Sold out' : `${(product.stock - inCart).toLocaleString()} left`}
          </span>
        ) : null}
      </div>
      {inCart ? (
        <span className="absolute top-2 right-2 flex min-w-7 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-sm font-semibold text-primary-foreground tabular">
          {inCart}
        </span>
      ) : null}
    </button>
  );
}

/** Sell (staff home, Section 6.5): search, category chips, photo tiles, and the cart. */
export function SellPage() {
  const { shop } = useMe();
  const catalog = useCatalog();
  const [rawCart, setRawCart] = useState<Cart>([]);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [lastSale, setLastSale] = useState<Receipt | null>(null);
  const deferred = useDeferredValue(query);
  const money = (c: number) => formatCents(c, shop.currency);

  const byId = useMemo(() => new Map(catalog.products.map((p) => [p.id, p])), [catalog.products]);
  // The cart always fits the latest stock (e.g. after the catalog reloads post-sale).
  const cart = useMemo(() => reconcile(rawCart, byId), [rawCart, byId]);
  // Always builds on the latest cart, so quick taps in a row are never lost.
  const setCart = (update: (c: Cart) => Cart) => {
    setRawCart((raw) => update(reconcile(raw, byId)));
  };

  const indexed = useMemo(
    () =>
      catalog.products.map((p) => ({
        p,
        name: searchKey(p.name),
        sku: p.sku ? searchKey(p.sku) : '',
      })),
    [catalog.products],
  );
  const visible = useMemo(() => {
    const q = searchKey(deferred.trim());
    return indexed
      .filter(
        ({ p, name, sku }) =>
          (!categoryId || p.categoryId === categoryId) &&
          (!q || name.includes(q) || sku.startsWith(q)),
      )
      .map((i) => i.p);
  }, [indexed, deferred, categoryId]);

  const { items, subtotalCents } = cartTotals(cart, byId);

  // Short confirmation after a scan or Enter ("Added Spark plug").
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  function announce(text: string, ok: boolean) {
    window.clearTimeout(noticeTimer.current);
    setNotice({ text, ok });
    noticeTimer.current = window.setTimeout(() => {
      setNotice(null);
    }, 2500);
  }

  function addProduct(p: ProductDto) {
    if (quantityOf(cart, p.id) >= maxQuantity(p)) {
      announce(
        maxQuantity(p) === 0 ? `${p.name} is sold out` : `No more ${p.name} in stock`,
        false,
      );
      return;
    }
    setCart((c) => addOne(c, p));
    announce(`Added ${p.name}`, true);
  }

  /** A scanned or typed SKU / barcode. */
  function addByCode(code: string) {
    const p = findBySku(catalog.products, code);
    if (p) addProduct(p);
    else announce(`No product with code ${code.trim()}`, false);
  }

  // Search box: Enter adds the exact SKU, or the only product left in the results.
  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const exact = findBySku(catalog.products, query);
    const only = visible.length === 1 ? visible[0] : undefined;
    const p = exact ?? only;
    if (p) {
      addProduct(p);
      setQuery('');
    } else if (query.trim()) {
      announce(`No product with code ${query.trim()}`, false);
    }
  }

  // Barcode scanners type fast and end with Enter. Read scans from anywhere on the screen
  // (not while typing in a field or a dialog is open), and swallow the scanner's Enter so
  // it doesn't also press a focused tile.
  const scanTarget = useRef(addByCode);
  useEffect(() => {
    scanTarget.current = addByCode;
  });
  const dialogOpen = cartOpen || checkingOut || lastSale !== null;
  useEffect(() => {
    if (dialogOpen) return;
    const read = createScanReader();
    const onKey = (e: globalThis.KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) {
        return;
      }
      const code = read(e.key, e.timeStamp);
      if (code) {
        e.preventDefault();
        scanTarget.current(code);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, [dialogOpen]);
  const panel = (
    <CartPanel
      cart={cart}
      products={byId}
      currency={shop.currency}
      items={items}
      subtotalCents={subtotalCents}
      onQuantity={(p, q) => {
        setCart((c) => setQuantity(c, p, q));
      }}
      onClear={() => {
        setRawCart([]);
      }}
      onCharge={() => {
        setCartOpen(false);
        setCheckingOut(true);
      }}
    />
  );

  return (
    <div className="-mx-4 -my-6 flex min-h-[calc(100dvh-3.5rem)] md:-mx-8 md:-my-8 md:h-[calc(100dvh-4rem)] md:min-h-0">
      <section className="flex min-w-0 flex-1 flex-col" aria-label="Products">
        <div className="space-y-3 border-b bg-background/95 px-4 py-3 md:px-6">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              inputMode="search"
              placeholder="Search name or SKU"
              aria-label="Search products by name or SKU"
              className="pl-10"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              onKeyDown={onSearchKey}
              autoComplete="off"
            />
          </div>
          {notice ? (
            <p
              role="status"
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium',
                notice.ok
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'bg-destructive/10 text-destructive',
              )}
            >
              {notice.text}
            </p>
          ) : null}
          {catalog.categories.length ? (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:-mx-6 md:px-6">
              <Chip
                active={categoryId === null}
                label="All"
                onClick={() => {
                  setCategoryId(null);
                }}
              />
              {catalog.categories.map((c) => (
                <Chip
                  key={c.id}
                  active={categoryId === c.id}
                  label={c.name}
                  onClick={() => {
                    setCategoryId(categoryId === c.id ? null : c.id);
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 pb-40 md:px-6 md:pb-6">
          {catalog.error ? <FormAlert>{catalog.error}</FormAlert> : null}
          {catalog.loading && catalog.products.length === 0 ? (
            <p role="status" className="text-muted-foreground">
              Loading products…
            </p>
          ) : null}
          {!catalog.loading && catalog.products.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Nothing to sell yet">
              Products added in Products show up here.
            </EmptyState>
          ) : null}
          {catalog.products.length > 0 && visible.length === 0 ? (
            <EmptyState icon={SearchX} title="No matching products" />
          ) : null}
          <div className="grid grid-cols-2 gap-3 min-[480px]:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visible.map((p) => (
              <SellTile
                key={p.id}
                product={p}
                inCart={quantityOf(cart, p.id)}
                money={money}
                onAdd={() => {
                  setCart((c) => addOne(c, p));
                }}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Tablet and PC: the cart stays beside the products. */}
      <aside className="hidden w-80 shrink-0 border-l bg-card md:block lg:w-96" aria-label="Cart">
        {panel}
      </aside>

      {/* Phones: a cart bar above the tab bar, opening the full cart. */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-card p-3 md:hidden">
        <Button
          size="lg"
          className="h-12 w-full justify-between text-base"
          disabled={cart.length === 0}
          onClick={() => {
            setCartOpen(true);
          }}
        >
          <span className="flex items-center gap-2">
            <ShoppingCart aria-hidden="true" />
            {items ? `${String(items)} item${items === 1 ? '' : 's'}` : 'Cart is empty'}
          </span>
          <span className="tabular">{money(subtotalCents)}</span>
        </Button>
      </div>
      <Dialog open={checkingOut} onOpenChange={setCheckingOut} title="Checkout">
        {checkingOut ? (
          <Checkout
            cart={cart}
            totalCents={subtotalCents}
            currency={shop.currency}
            onStockChanged={catalog.reload}
            onSold={(receipt) => {
              setCheckingOut(false);
              setRawCart([]);
              setLastSale(receipt);
              catalog.reload();
            }}
          />
        ) : null}
      </Dialog>
      <Dialog
        open={lastSale !== null}
        onOpenChange={(open) => {
          if (!open) setLastSale(null);
        }}
        title={lastSale ? `Sale #${String(lastSale.number)}` : 'Sale'}
      >
        {lastSale ? (
          <ReceiptView
            receipt={lastSale}
            onNewSale={() => {
              setLastSale(null);
            }}
          />
        ) : null}
      </Dialog>
      <Dialog open={cartOpen} onOpenChange={setCartOpen} title="Cart">
        <div className="-mx-5 -my-5 h-[calc(100dvh-5rem)] sm:h-[70dvh]">{panel}</div>
      </Dialog>
    </div>
  );
}
