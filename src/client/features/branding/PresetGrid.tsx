import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import { PRESETS } from '@shared/theme';

/** The one-tap color presets (Section 6.3). */
export function PresetGrid({
  value,
  onPick,
}: {
  value: string | undefined;
  onPick: (brand: string, presetId: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Presets" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {PRESETS.map((p) => {
        const active = value === p.id;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              onPick(p.brand, p.id);
            }}
            className={cn(
              'flex items-center gap-3 rounded-lg border p-3 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              active ? 'border-primary bg-primary/10' : 'hover:bg-accent',
            )}
          >
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-white"
              style={{ background: p.brand }}
            >
              {active ? <Check className="size-4" aria-hidden="true" /> : null}
            </span>
            <span className="font-medium">{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}
