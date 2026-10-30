import { Grid2x2, LayoutGrid, LayoutList, List, type LucideIcon } from 'lucide-react';

import { PRODUCT_VIEWS, setPreferences, usePreferences, type Preferences } from '@/lib/preferences';
import { cn } from '@/lib/utils';

const VIEWS: Record<Preferences['productView'], { label: string; icon: LucideIcon }> = {
  list: { label: 'List', icon: LayoutList },
  compact: { label: 'Compact list', icon: List },
  tiles: { label: 'Tiles', icon: LayoutGrid },
  'large-tiles': { label: 'Large tiles', icon: Grid2x2 },
};

/** Quick switch between product views; the same choice as in Settings. */
export function ViewSwitcher() {
  const { productView } = usePreferences();
  return (
    <div
      role="group"
      aria-label="Product view"
      className="inline-flex rounded-lg border bg-card p-0.5"
    >
      {PRODUCT_VIEWS.map((v) => {
        const { label, icon: Icon } = VIEWS[v];
        const active = productView === v;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={active}
            aria-label={label}
            title={label}
            onClick={() => {
              setPreferences({ productView: v });
            }}
            className={cn(
              'flex size-10 items-center justify-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
