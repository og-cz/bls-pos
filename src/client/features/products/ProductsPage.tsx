import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { Package, Plus, Search, SearchX, Upload } from 'lucide-react';

import { useMe } from '@/app/session';
import { EmptyState, PageHeader } from '@/components/empty-state';
import { FormAlert } from '@/components/field';
import { Link } from '@/components/link';
import { PhotoViewer, ProductPhoto } from '@/components/product-photo';
import { ProductTiles } from '@/components/product-tiles';
import { ViewSwitcher } from '@/components/view-switcher';
import { usePreferences } from '@/lib/preferences';
import { StockBadge } from '@/components/stock-badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { apiDelete } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatCents } from '@shared/money';
import { hasRole } from '@shared/roles';
import { SAMPLE_SKU_PREFIX } from '@shared/samples';
import type { ProductDto } from '@shared/schemas/products';

import { ExportMenu } from '../import/ExportMenu';
import { ProductForm } from './ProductForm';
import { searchKey, useCatalog } from './use-catalog';

type StockFilter = 'all' | 'low';

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-9 shrink-0 rounded-full border px-4 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'bg-card text-foreground hover:bg-accent',
      )}
    >
      {children}
    </button>
  );
}

/** Products (Section 6.5): table on PC, cards on phone, searched on the device. */
export function ProductsPage() {
  const { user, shop } = useMe();
  const { productView } = usePreferences();
  const isAdmin = hasRole(user.role, 'admin');
  const [archived, setArchived] = useState(false);
  const catalog = useCatalog(archived);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const deferredQuery = useDeferredValue(query);

  const categoryName = useMemo(
    () => new Map(catalog.categories.map((c) => [c.id, c.name])),
    [catalog.categories],
  );
  const indexed = useMemo(
    () =>
      catalog.products.map((p) => ({
        product: p,
        name: searchKey(p.name),
        sku: p.sku ? searchKey(p.sku) : '',
      })),
    [catalog.products],
  );

  const visible = useMemo(() => {
    const q = searchKey(deferredQuery.trim());
    return indexed
      .filter(({ product, name, sku }) => {
        if (categoryId && product.categoryId !== categoryId) return false;
        if (
          stockFilter === 'low' &&
          product.stockStatus !== 'low' &&
          product.stockStatus !== 'out'
        ) {
          return false;
        }
        return !q || name.includes(q) || sku.startsWith(q);
      })
      .map((i) => i.product);
  }, [indexed, deferredQuery, categoryId, stockFilter]);

  const lowCount = catalog.products.filter(
    (p) => p.stockStatus === 'low' || p.stockStatus === 'out',
  ).length;
  const money = (cents: number) => formatCents(cents, shop.currency);
  const filtered = query !== '' || categoryId !== null || stockFilter !== 'all';
  // 'new' = the add form; a product = its edit form. Editing is for admins only.
  const [editing, setEditing] = useState<ProductDto | 'new' | null>(null);
  const [viewing, setViewing] = useState<Parameters<typeof PhotoViewer>[0]['photo']>(null);
  const [removingSamples, setRemovingSamples] = useState(false);
  const hasSamples = catalog.products.some((p) => p.sku?.startsWith(SAMPLE_SKU_PREFIX));
  const open = (p: ProductDto) => {
    if (isAdmin) setEditing(p);
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title={archived ? 'Archived products' : 'Products'}
          description={
            catalog.loading && catalog.products.length === 0
              ? undefined
              : `${catalog.products.length.toLocaleString()} ${archived ? 'archived' : 'products'}`
          }
        />
        {isAdmin && !archived ? (
          // Phones: Export and Import share a row, Add product gets its own full-width row.
          <div className="mb-6 flex w-full flex-wrap gap-2 sm:w-auto">
            <ExportMenu />
            <Button variant="outline" className="flex-1 sm:flex-none" asChild>
              <Link href="/products/import">
                <Upload aria-hidden="true" />
                Import
              </Link>
            </Button>
            <Button
              className="basis-full sm:basis-auto"
              onClick={() => {
                setEditing('new');
              }}
            >
              <Plus aria-hidden="true" />
              Add product
            </Button>
          </div>
        ) : null}
      </div>

      {isAdmin && !archived && hasSamples ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-3 text-sm">
          <span className="min-w-0 flex-1">
            Sample products are in your list. Remove them when you&apos;re ready to add your own.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={removingSamples}
            onClick={() => {
              setRemovingSamples(true);
              apiDelete('/shop/samples')
                .then(() => {
                  catalog.reload();
                })
                .catch(() => undefined)
                .finally(() => {
                  setRemovingSamples(false);
                });
            }}
          >
            Remove sample products
          </Button>
        </div>
      ) : null}

      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-48 flex-1">
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
            />
          </div>
          <ViewSwitcher />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          <Chip
            active={categoryId === null}
            onClick={() => {
              setCategoryId(null);
            }}
          >
            All
          </Chip>
          {catalog.categories.map((c) => (
            <Chip
              key={c.id}
              active={categoryId === c.id}
              onClick={() => {
                setCategoryId(categoryId === c.id ? null : c.id);
              }}
            >
              {c.name}
            </Chip>
          ))}
          {!archived ? (
            <Chip
              active={stockFilter === 'low'}
              onClick={() => {
                setStockFilter(stockFilter === 'low' ? 'all' : 'low');
              }}
            >
              Low stock{lowCount ? ` (${lowCount.toLocaleString()})` : ''}
            </Chip>
          ) : null}
          {isAdmin ? (
            <Chip
              active={archived}
              onClick={() => {
                setArchived(!archived);
                setStockFilter('all');
              }}
            >
              Archived
            </Chip>
          ) : null}
        </div>
      </div>

      {catalog.error ? <FormAlert>{catalog.error}</FormAlert> : null}
      {catalog.loading && catalog.products.length === 0 ? (
        <p role="status" className="text-muted-foreground">
          Loading products…
        </p>
      ) : null}

      {!catalog.loading && catalog.products.length === 0 && !catalog.error ? (
        <EmptyState icon={Package} title={archived ? 'Nothing archived' : 'No products yet'}>
          {archived
            ? 'Products you archive show up here, and can be restored.'
            : 'Add your first product to start selling.'}
        </EmptyState>
      ) : null}

      {catalog.products.length > 0 && visible.length === 0 ? (
        <EmptyState icon={SearchX} title="No matching products">
          {filtered ? 'Try a different search or filter.' : null}
        </EmptyState>
      ) : null}

      {visible.length > 0 && (productView === 'tiles' || productView === 'large-tiles') ? (
        <ProductTiles
          products={visible}
          size={productView}
          onOpenPhoto={setViewing}
          onSelect={isAdmin ? open : undefined}
          subtitle={(p) => <span className="font-semibold tabular">{money(p.priceCents)}</span>}
        />
      ) : visible.length > 0 && productView === 'compact' ? (
        <ul className="divide-y rounded-xl border bg-card">
          {visible.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-1.5">
              <ProductPhoto product={p} onOpen={setViewing} className="size-10" />
              <div className="min-w-0 flex-1 truncate text-sm">
                {isAdmin ? (
                  <button
                    type="button"
                    className="rounded font-medium outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    onClick={() => {
                      open(p);
                    }}
                  >
                    {p.name}
                  </button>
                ) : (
                  <span className="font-medium">{p.name}</span>
                )}
                {p.sku ? (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{p.sku}</span>
                ) : null}
              </div>
              <StockBadge status={p.stockStatus} stock={p.stock} />
              <div className="w-24 text-right text-sm font-semibold tabular">
                {money(p.priceCents)}
              </div>
            </li>
          ))}
        </ul>
      ) : visible.length > 0 ? (
        <>
          {/* Phone: cards */}
          <ul className="space-y-2 md:hidden">
            {visible.map((p) => (
              <li
                key={p.id}
                className={cn(
                  'relative flex items-center gap-3 rounded-xl border bg-card p-3',
                  isAdmin && 'hover:bg-accent/50',
                )}
              >
                <ProductPhoto product={p} onOpen={setViewing} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {isAdmin ? (
                      <button
                        type="button"
                        className="text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
                        onClick={() => {
                          open(p);
                        }}
                      >
                        {p.name}
                      </button>
                    ) : (
                      p.name
                    )}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {[p.categoryId ? categoryName.get(p.categoryId) : null, p.sku]
                      .filter(Boolean)
                      .join(' · ') || 'No category'}
                  </div>
                  <div className="mt-1">
                    <StockBadge status={p.stockStatus} stock={p.stock} />
                  </div>
                </div>
                <div className="text-right font-semibold tabular">{money(p.priceCents)}</div>
              </li>
            ))}
          </ul>

          {/* Tablet and PC: table */}
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Product
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Category
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Price
                  </th>
                  {isAdmin ? (
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Cost
                    </th>
                  ) : null}
                  <th scope="col" className="px-4 py-3 font-medium">
                    Stock
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <ProductPhoto product={p} onOpen={setViewing} />
                        <div className="min-w-0">
                          <div className="font-medium">
                            {isAdmin ? (
                              <button
                                type="button"
                                className="rounded text-left outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                                onClick={() => {
                                  open(p);
                                }}
                              >
                                {p.name}
                              </button>
                            ) : (
                              p.name
                            )}
                          </div>
                          {p.sku ? (
                            <div className="font-mono text-xs text-muted-foreground">{p.sku}</div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {p.categoryId ? categoryName.get(p.categoryId) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular">
                      {money(p.priceCents)}
                    </td>
                    {isAdmin ? (
                      <td className="px-4 py-2 text-right text-muted-foreground tabular">
                        {p.costCents == null ? '—' : money(p.costCents)}
                      </td>
                    ) : null}
                    <td className="px-4 py-2">
                      <StockBadge status={p.stockStatus} stock={p.stock} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <PhotoViewer
        photo={viewing}
        onClose={() => {
          setViewing(null);
        }}
      />

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        title={editing === 'new' ? 'Add product' : 'Edit product'}
      >
        {editing !== null ? (
          <ProductForm
            key={editing === 'new' ? 'new' : editing.id}
            product={editing === 'new' ? null : editing}
            categories={catalog.categories}
            onSaved={() => {
              setEditing(null);
              catalog.reload();
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}
