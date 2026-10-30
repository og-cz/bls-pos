import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { FONT_FAMILY, FONT_LABEL, FONTS, RADII, RADIUS_REM, type Theme } from '@shared/theme';

function Options<V extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: V;
  options: { value: V; label: string; icon?: LucideIcon; style?: React.CSSProperties }[];
  onChange: (v: V) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div role="radiogroup" aria-label={legend} className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                onChange(o.value);
              }}
              style={o.style}
              className={cn(
                'flex h-11 items-center gap-2 border px-4 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                active ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-accent',
                o.style ? '' : 'rounded-lg',
              )}
            >
              {o.icon ? <o.icon className="size-4" aria-hidden="true" /> : null}
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Light/dark, font and corners for the whole shop (Section 6.2). */
export function LookSettings({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (patch: Partial<Theme>) => void;
}) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <h2 className="font-semibold">Look</h2>
      <Options
        legend="Light or dark"
        value={theme.mode}
        onChange={(mode) => {
          onChange({ mode });
        }}
        options={[
          { value: 'system', label: 'Automatic', icon: Monitor },
          { value: 'light', label: 'Light', icon: Sun },
          { value: 'dark', label: 'Dark', icon: Moon },
        ]}
      />
      <p className="-mt-2 text-xs text-muted-foreground">
        The shop&apos;s default. Anyone can still pick their own in Settings.
      </p>
      <Options
        legend="Font"
        value={theme.font}
        onChange={(font) => {
          onChange({ font });
        }}
        options={FONTS.map((f) => ({
          value: f,
          label: FONT_LABEL[f],
          // Each name is shown in its own font (it loads when picked).
          style: { fontFamily: `'${FONT_FAMILY[f]}', sans-serif`, borderRadius: '0.5rem' },
        }))}
      />
      <Options
        legend="Corners"
        value={theme.radius}
        onChange={(radius) => {
          onChange({ radius });
        }}
        options={RADII.map((r) => ({
          value: r,
          label: { sharp: 'Sharp', soft: 'Soft', round: 'Round' }[r],
          style: { borderRadius: `${String(RADIUS_REM[r])}rem` },
        }))}
      />
    </section>
  );
}
