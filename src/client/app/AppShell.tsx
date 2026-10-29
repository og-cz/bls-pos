import type { ReactNode } from 'react';
import { DropdownMenu } from 'radix-ui';
import { ChevronDown, LogOut } from 'lucide-react';

import { BrandLogo } from '@/components/brand-logo';
import { Link } from '@/components/link';
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

/**
 * Signed-in layout (Section 6.1): a sidebar on tablets and PCs, a bottom tab bar on
 * phones. Menu items follow the user's role; the server enforces the same rules.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, shop } = useMe();
  const pathname = usePathname();
  const items = navFor(user.role);
  const tabs = items.filter((i) => i.tab);
  const menuOnly = items.filter((i) => !i.tab);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      {/* Sidebar: tablet and up */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-card md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <BrandLogo decorative className="size-8" />
          <span className="font-semibold tracking-tight">{APP_NAME}</span>
        </div>
        <nav aria-label="Main" className="flex-1 space-y-1 px-3">
          {items.map((item) => {
            const active = isActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <item.icon className="size-5" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur md:h-16 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
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
