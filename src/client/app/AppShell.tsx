import { useEffect, useState, type ReactNode } from 'react';
import { Dialog as DialogPrimitive, DropdownMenu } from 'radix-ui';
import { ChevronDown, LogOut, Menu, X } from 'lucide-react';

import { Avatar } from '@/components/avatar';
import { BrandLogo } from '@/components/brand-logo';
import { Link } from '@/components/link';
import { setPreferences, usePreferences } from '@/lib/preferences';
import { usePathname } from '@/lib/router';
import { useBackgroundSync } from '@/lib/sync';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@shared/app';
import { SETUP_FINISHED } from '@shared/onboarding';
import { hasRole } from '@shared/roles';

import { NAV_GROUPS, navFor, PROFILE_ITEM, type NavGroup, type NavItem } from './nav';
import { logout, useMe } from './session';

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', staff: 'Staff' } as const;

function isActive(item: NavItem, pathname: string) {
  return item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
}

/** The profile menu: screens not in the tab bar, then Settings and Log out. */
function AccountMenu({ extra, bottom }: { extra: NavItem[]; bottom: NavItem[] }) {
  const { user } = useMe();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="flex h-11 min-w-0 items-center gap-2 rounded-md px-2 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label="Account menu"
        data-tour="account"
      >
        <Avatar name={user.displayName} url={user.avatarUrl} />
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-sm font-medium">{user.displayName}</span>
          <span className="block text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-52 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <div className="px-3 py-2 text-sm">
            <div className="font-medium">{user.displayName}</div>
            <div className="text-muted-foreground">
              @{user.username} · {ROLE_LABEL[user.role]}
            </div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          {[PROFILE_ITEM, ...extra, ...bottom].map((item) => (
            <DropdownMenu.Item key={item.href} asChild>
              <Link
                href={item.href}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-sm outline-none data-[highlighted]:bg-accent"
              >
                <item.icon className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            onSelect={() => void logout()}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-sm outline-none data-[highlighted]:bg-accent"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Log out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function NavLinks({
  items,
  pathname,
  collapsed = false,
  compact = false,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
  /** Mouse-sized rows for the PC/tablet side menu; the phone drawer keeps finger-sized ones. */
  compact?: boolean;
}) {
  // Consecutive items of one group form a section with a small heading (a line when
  // the menu shows icons only).
  const sections: { group: NavGroup | undefined; items: NavItem[] }[] = [];
  for (const item of items) {
    const last = sections.at(-1);
    if (last && last.group === item.group) last.items.push(item);
    else sections.push({ group: item.group, items: [item] });
  }
  const link = (item: NavItem) => {
    const active = isActive(item, pathname);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        data-tour={`nav${item.href}`}
        // Icons only when collapsed: the name is still there for screen readers and as a tooltip.
        aria-label={collapsed ? item.label : undefined}
        title={collapsed ? item.label : undefined}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          compact ? 'h-9' : 'h-11',
          collapsed && 'justify-center px-0',
          active
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        <item.icon className="size-5 shrink-0" aria-hidden="true" />
        {collapsed ? null : item.label}
      </Link>
    );
  };
  return (
    <>
      {sections.map((section, i) => {
        const heading = section.group && sections.length > 1 ? NAV_GROUPS[section.group] : null;
        const id = heading ? `nav-${section.group ?? ''}${collapsed ? '-c' : ''}` : undefined;
        return (
          <div
            key={section.group ?? i}
            role={heading ? 'group' : undefined}
            aria-labelledby={heading && !collapsed ? id : undefined}
            aria-label={heading && collapsed ? heading : undefined}
            className={cn(
              compact ? 'space-y-0.5' : 'space-y-1',
              i > 0 && (collapsed ? 'mt-1.5 border-t pt-1.5' : 'mt-3'),
            )}
          >
            {heading && !collapsed ? (
              <div
                id={id}
                className="px-3 pb-0.5 text-[11px] leading-4 font-semibold tracking-wide text-muted-foreground/70 uppercase"
              >
                {heading}
              </div>
            ) : null}
            {section.items.map(link)}
          </div>
        );
      })}
    </>
  );
}

/** Phone menu: slides in from the side chosen in Settings, with every screen and Log out. */
function MenuDrawer({
  open,
  onOpenChange,
  items,
  pathname,
  side,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NavItem[];
  pathname: string;
  side: 'left' | 'right';
}) {
  const { user, shop } = useMe();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-y-0 z-50 flex w-72 max-w-[85vw] flex-col bg-card text-card-foreground shadow-lg outline-none',
            side === 'left' ? 'left-0 border-r' : 'right-0 border-l',
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <BrandLogo decorative className="size-7" />
              <DialogPrimitive.Title className="font-semibold tracking-tight">
                {APP_NAME}
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close
              className="flex size-11 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="border-b px-4 py-3 text-sm">
            <div className="truncate font-medium">{shop.name}</div>
            <div className="truncate text-muted-foreground">
              {user.displayName} · {ROLE_LABEL[user.role]}
            </div>
          </div>
          <nav aria-label="Menu" className="flex-1 overflow-y-auto p-3">
            <NavLinks
              items={items.filter((i) => !i.bottom)}
              pathname={pathname}
              onNavigate={() => {
                onOpenChange(false);
              }}
            />
          </nav>
          <div className="space-y-1 border-t p-3">
            <NavLinks
              items={items.filter((i) => i.bottom)}
              pathname={pathname}
              onNavigate={() => {
                onOpenChange(false);
              }}
            />
            <button
              type="button"
              onClick={() => void logout()}
              className="flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <LogOut className="size-5" aria-hidden="true" />
              Log out
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Signed-in layout (Section 6.1): a side menu on tablets and PCs (its hamburger button
 * collapses it to icons; Settings sits at the bottom below a divider), and on phones a
 * bottom tab bar plus a hamburger in the header that opens the full menu. Menu items
 * follow the user's role; the server enforces the same rules.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, shop } = useMe();
  const prefs = usePreferences();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const items = navFor(user.role);
  const tabs = items.filter((i) => i.tab);
  const menuOnly = items.filter((i) => !i.tab && !i.bottom);
  const collapsed = prefs.menuCollapsed;
  const right = prefs.menuSide === 'right';
  useBackgroundSync(user.id);

  // First visit: a short guided tour, admins on the dashboard, staff on the sell screen.
  // Its code (driver.js) downloads only when it is needed.
  const tour =
    hasRole(user.role, 'admin') && pathname === '/' && shop.onboardingStep >= SETUP_FINISHED
      ? 'admin'
      : user.role === 'staff' && pathname === '/sell'
        ? 'staff'
        : null;
  useEffect(() => {
    if (!tour) return;
    const timer = setTimeout(() => {
      void import('@/features/tour/tours').then(({ hasSeenTour, startTour }) => {
        if (!hasSeenTour(user.id, tour)) startTour(user.id, tour);
      });
    }, 800);
    return () => {
      clearTimeout(timer);
    };
  }, [tour, user.id]);

  const mainItems = items.filter((i) => !i.bottom);
  const bottomItems = items.filter((i) => i.bottom);

  return (
    <div
      className={cn(
        'min-h-dvh md:grid',
        right
          ? collapsed
            ? 'md:grid-cols-[1fr_4.5rem]'
            : 'md:grid-cols-[1fr_15rem]'
          : collapsed
            ? 'md:grid-cols-[4.5rem_1fr]'
            : 'md:grid-cols-[15rem_1fr]',
      )}
    >
      {/* Side menu: tablet and up */}
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh flex-col bg-card md:flex',
          right ? 'order-2 border-l' : 'border-r',
        )}
      >
        <div
          className={cn(
            'flex h-16 items-center gap-2',
            collapsed ? 'justify-center' : 'justify-between pr-2 pl-5',
          )}
        >
          {/* Logo and name on the left, the hamburger at the right end. */}
          {collapsed ? null : (
            <div className="flex min-w-0 items-center gap-2">
              <BrandLogo decorative className="size-7" />
              <span className="truncate font-semibold tracking-tight">{APP_NAME}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setPreferences({ menuCollapsed: !collapsed });
            }}
            aria-label={collapsed ? 'Show menu names' : 'Show icons only'}
            aria-expanded={!collapsed}
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
        </div>
        <nav
          aria-label="Main"
          className={cn('flex-1 overflow-y-auto pb-3', collapsed ? 'px-2' : 'px-3')}
        >
          <NavLinks items={mainItems} pathname={pathname} collapsed={collapsed} compact />
        </nav>
        <div className={cn('space-y-1 border-t py-3', collapsed ? 'px-2' : 'px-3')}>
          <NavLinks items={bottomItems} pathname={pathname} collapsed={collapsed} compact />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b bg-card/95 px-4 backdrop-blur md:h-16 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            {/* Phones only: PCs and tablets have the button in the side menu. */}
            <button
              type="button"
              onClick={() => {
                setDrawerOpen(true);
              }}
              aria-label="Menu"
              data-tour="menu-button"
              aria-expanded={drawerOpen}
              className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 md:hidden"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
            <BrandLogo decorative className="size-7 md:hidden" />
            <div className="min-w-0">
              <div className="truncate font-semibold">{shop.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                Shop code <span className="font-mono">{shop.slug}</span>
              </div>
            </div>
          </div>
          <AccountMenu extra={menuOnly} bottom={items.filter((i) => i.bottom)} />
        </header>

        {/* Bottom padding keeps content clear of the phone tab bar. */}
        <main className="flex-1 px-4 py-6 pb-24 md:px-8 md:pb-8">{children}</main>
      </div>

      <MenuDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        items={items}
        pathname={pathname}
        side={prefs.menuSide}
      />

      {/* Tab bar: phones */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 grid border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((item) => {
          const active = isActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              data-tour={`nav${item.href}`}
              className={cn(
                'flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium outline-none focus-visible:bg-accent',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <item.icon className="size-5" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
