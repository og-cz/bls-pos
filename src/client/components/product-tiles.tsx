import { useState, type ReactNode } from 'react';
import { ImageOff } from 'lucide-react';

import { StockBadge } from '@/components/stock-badge';
import { cn } from '@/lib/utils';
import type { ProductDto } from '@shared/schemas/products';

type Size = 'tiles' | 'large-tiles';

/** Square photo filling the top of a tile. Tap to see it full size. */
function TilePhoto({
  product,
  large,
  onOpen,
}: {
  product: ProductDto;
  large: boolean;
  onOpen: (p: ProductDto) => void;
}) {
  // Small tiles use the thumbnail; large tiles the full photo, so they stay sharp.
  const preferred = large ? product.imageUrl : (product.thumbUrl ?? product.imageUrl);
  const [failed, setFailed] = useState<string | null>(null);
  const src = preferred && preferred !== failed ? preferred : product.imageUrl;

  if (!product.imageUrl || !src) {
    return (
      <div
        className="flex aspect-square w-full items-center justify-center bg-muted text-muted-foreground"
        aria-hidden="true"
      >
        <ImageOff className="size-8" />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        onOpen(product);
      }}
      aria-label={`View photo of ${product.name}`}
      className="block aspect-square w-full bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="size-full object-cover"
        onError={() => {
          if (src !== product.imageUrl) setFailed(src);
        }}
      />
    </button>
  );
}

/**
 * Products as tiles with big photos, like a POS screen. `footer` adds per-tile actions;
 * `onSelect` makes the name open the product (e.g. to edit).
 */
export function ProductTiles({
  products,
  size,
  onOpenPhoto,
  onSelect,
  subtitle,
  footer,
}: {
  products: ProductDto[];
  size: Size;
  onOpenPhoto: (p: ProductDto) => void;
  onSelect?: ((p: ProductDto) => void) | undefined;
  subtitle?: (p: ProductDto) => ReactNode;
  footer?: (p: ProductDto) => ReactNode;
}) {
  const large = size === 'large-tiles';
  return (
    <ul
      className={cn(
        'grid gap-3',
        large
          ? 'grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3'
          : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
      )}
    >
      {products.map((p) => (
        <li key={p.id} className="flex flex-col overflow-hidden rounded-xl border bg-card">
          <TilePhoto product={p} large={large} onOpen={onOpenPhoto} />
          <div className="flex flex-1 flex-col gap-1 p-3">
            <div className={cn('font-medium leading-snug', large ? 'text-base' : 'text-sm')}>
              {onSelect ? (
                <button
                  type="button"
                  className="line-clamp-2 rounded text-left outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onClick={() => {
                    onSelect(p);
                  }}
                >
                  {p.name}
                </button>
              ) : (
                <span className="line-clamp-2">{p.name}</span>
              )}
            </div>
            {subtitle ? <div className="text-sm">{subtitle(p)}</div> : null}
            <div className="mt-auto pt-1">
              <StockBadge status={p.stockStatus} stock={p.stock} />
            </div>
            {footer ? <div className="pt-2">{footer(p)}</div> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
