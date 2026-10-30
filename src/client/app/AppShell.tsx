import { useState, type ReactNode } from 'react';
import { Dialog as DialogPrimitive, DropdownMenu } from 'radix-ui';
import { ChevronDown, LogOut, Menu, X } from 'lucide-react';

import { BrandLogo } from '@/components/brand-logo';
import { Link } from '@/components/link';
import { setPreferences, usePreferences } from '@/lib/preferences';
import { usePathname } from '@/lib/router';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@shared/app';

import { navFor, type NavItem } from './nav';
import { logout, useMe } from './session';

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', staff: 'Staff' } as const;

function isActive(item: NavItem, pathname: string) {
  return item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
}

function AccountMenu({ extra }: { extra: NavItem[] }) {
  const { user } = useMe();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="flex h-11 min-w-0 items-center gap-2 rounded-md px-2 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label="Account menu"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {user.displayName.slice(0, 1).toUpperCase()}
        </span>
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
          {extra.map((item) => (
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
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      {items.map((item) => {
        const active = isActive(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            // Icons only when collapsed: the name is still there for screen readers and as a tooltip.
            aria-label={collapsed ? item.label : undefined}
            title={collapsed ? item.label : undefined}
            className={cn(
              'flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
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
          <nav aria-label="Menu" className="flex-1 space-y-1 overflow-y-auto p-3">
            <NavLinks
              items={items}
              pathname={pathname}
              onNavigate={() => {
                onOpenChange(false);
              }}
            />
          </nav>
          <div className="border-t p-3">
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
 * Signed-in layout (Section 6.1): a side menu on tablets and PCs, a bottom tab bar on
 * phones, and a hamburger button that collapses the side menu (PC) or opens the full menu
 * (phone). Menu items follow the user's role; the server enforces the same rules.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, shop } = useMe();
  const prefs = usePreferences();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const items = navFor(user.role);
  const tabs = items.filter((i) => i.tab);
  const menuOnly = items.filter((i) => !i.tab);
  const collapsed = prefs.menuCollapsed;
  const right = prefs.menuSide === 'right';

  function toggleMenu() {
    if (window.matchMedia('(min-width: 768px)').matches) {
      setPreferences({ menuCollapsed: !collapsed });
    } else {
      setDrawerOpen(true);
    }
  }

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
        <div className={cn('flex items-center gap-2 py-5', collapsed ? 'justify-center' : 'px-5')}>
          <BrandLogo decorative className="size-8" />
          {collapsed ? null : <span className="font-semibold tracking-tight">{APP_NAME}</span>}
        </div>
        <nav aria-label="Main" className={cn('flex-1 space-y-1', collapsed ? 'px-2' : 'px-3')}>
          <NavLinks items={items} pathname={pathname} collapsed={collapsed} />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur md:h-16 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={toggleMenu}
              aria-label="Menu"
              aria-expanded={drawerOpen || undefined}
              className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
          <AccountMenu extra={menuOnly} />
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
        className="fixed inset-x-0 bottom-0 z-40 grid border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((item) => {
          const active = isActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
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
