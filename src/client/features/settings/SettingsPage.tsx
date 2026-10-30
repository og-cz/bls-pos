import { useId, type ReactNode } from 'react';
import {
  LayoutGrid,
  LayoutList,
  Grid2x2,
  List,
  Monitor,
  Moon,
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  Sun,
  Type,
  type LucideIcon,
} from 'lucide-react';

import { useMe } from '@/app/session';
import { PageHeader } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_PREFERENCES,
  setPreferences,
  usePreferences,
  type Preferences,
} from '@/lib/preferences';
import { cn } from '@/lib/utils';
import { hasRole } from '@shared/roles';

type Option<V extends string> = { value: V; label: string; hint?: string; icon: LucideIcon };

/** A group of tappable cards that behaves like radio buttons (arrow keys, screen readers). */
function Choice<V extends string>({
  legend,
  description,
  value,
  options,
  onChange,
  columns = 3,
}: {
  legend: string;
  description?: string;
  value: V;
  options: Option<V>[];
  onChange: (v: V) => void;
  columns?: 2 | 3 | 4;
}) {
  const name = useId();
  return (
    <fieldset className="space-y-3">
      <legend className="font-medium">{legend}</legend>
      {description ? <p className="-mt-2 text-sm text-muted-foreground">{description}</p> : null}
      <div
        className={cn(
          'grid gap-2',
          columns === 2 && 'grid-cols-2',
          columns === 3 && 'grid-cols-3',
          columns === 4 && 'grid-cols-2 sm:grid-cols-4',
        )}
      >
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex min-h-11 cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-sm transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
              value === o.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'bg-card hover:bg-accent',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => {
                onChange(o.value);
              }}
              className="sr-only"
            />
            <o.icon className="size-6" aria-hidden="true" />
            <span className="font-medium">{o.label}</span>
            {o.hint ? <span className="text-xs text-muted-foreground">{o.hint}</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-6 rounded-xl border bg-card p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Settings for how the app looks on this device. */
export function SettingsPage() {
  const prefs = usePreferences();
  const { user } = useMe();
  const set =
    <K extends keyof Preferences>(key: K) =>
    (value: Preferences[K]) => {
      setPreferences({ [key]: value });
    };

  return (
    <>
      <PageHeader
        title="Settings"
        description="How bls POS looks on this device. Each phone, tablet or PC keeps its own."
      />
      <div className="max-w-2xl space-y-6">
        <Section title="Appearance">
          <Choice
            legend="Theme"
            value={prefs.theme}
            onChange={set('theme')}
            options={[
              {
                value: 'system',
                label: 'Automatic',
                hint: "Follows the shop's look, then the device",
                icon: Monitor,
              },
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'dark', label: 'Dark', hint: 'Easier at night', icon: Moon },
            ]}
          />
          <Choice
            legend="Text size"
            value={prefs.textSize}
            onChange={set('textSize')}
            columns={2}
            options={[
              { value: 'normal', label: 'Normal', icon: Type },
              { value: 'large', label: 'Large', hint: 'Easier to read', icon: Type },
            ]}
          />
          {hasRole(user.role, 'admin') ? (
            <p className="text-sm text-muted-foreground">
              Your shop&apos;s own brand colors, logo and cover photo come with Branding.
            </p>
          ) : null}
        </Section>

        <Section title="Layout">
          <Choice
            legend="Products and stock"
            description="How products are shown on the Products and Inventory screens."
            value={prefs.productView}
            onChange={set('productView')}
            columns={4}
            options={[
              { value: 'list', label: 'List', hint: 'Default', icon: LayoutList },
              { value: 'compact', label: 'Compact list', hint: 'More per screen', icon: List },
              { value: 'tiles', label: 'Tiles', hint: 'Like a POS', icon: LayoutGrid },
              { value: 'large-tiles', label: 'Large tiles', hint: 'Big photos', icon: Grid2x2 },
            ]}
          />
          <Choice
            legend="Menu side"
            description="Which side the menu sits on (side menu on PC and tablet, drawer on phones)."
            value={prefs.menuSide}
            onChange={set('menuSide')}
            columns={2}
            options={[
              { value: 'left', label: 'Left', icon: PanelLeft },
              {
                value: 'right',
                label: 'Right',
                hint: 'Handy for left-handed use',
                icon: PanelRight,
              },
            ]}
          />
          <Choice
            legend="Side menu on PC and tablet"
            value={prefs.menuCollapsed ? 'icons' : 'full'}
            onChange={(v) => {
              setPreferences({ menuCollapsed: v === 'icons' });
            }}
            columns={2}
            options={[
              { value: 'full', label: 'Icons and names', icon: PanelLeft },
              { value: 'icons', label: 'Icons only', hint: 'More room', icon: PanelLeftClose },
            ]}
          />
        </Section>

        <Button
          variant="outline"
          onClick={() => {
            setPreferences(DEFAULT_PREFERENCES);
          }}
        >
          Reset to default
        </Button>
      </div>
    </>
  );
}
