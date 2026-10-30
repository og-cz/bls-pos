import { lazy, Suspense, useEffect, type ComponentType, type LazyExoticComponent } from 'react';

import { navigate, usePathname } from '@/lib/router';
import { APP_NAME } from '@shared/app';
import { hasRole } from '@shared/roles';

import { AppShell } from './AppShell';
import { homeFor, NAV } from './nav';
import { SessionGate } from './SessionGate';
import { useMe } from './session';

// Each screen is its own download (route-level code splitting, Section 11), so the sell
// screen never waits for import, export or settings code.
type Page = LazyExoticComponent<ComponentType>;

const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K): Page =>
  lazy(async () => ({ default: (await load())[name] }));

const LoginPage = page(() => import('@/features/auth/LoginPage'), 'LoginPage');
const SignupPage = page(() => import('@/features/auth/SignupPage'), 'SignupPage');
const RecoverPage = page(() => import('@/features/auth/RecoverPage'), 'RecoverPage');
const DashboardPage = page(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage');
const SellPage = page(() => import('@/features/sell/SellPage'), 'SellPage');
const InventoryPage = page(() => import('@/features/inventory/InventoryPage'), 'InventoryPage');
const ProductsPage = page(() => import('@/features/products/ProductsPage'), 'ProductsPage');
const StaffPage = page(() => import('@/features/staff/StaffPage'), 'StaffPage');
const ActivityPage = page(() => import('@/features/activity/ActivityPage'), 'ActivityPage');
const ImportPage = page(() => import('@/features/import/ImportPage'), 'ImportPage');
const SettingsPage = page(() => import('@/features/settings/SettingsPage'), 'SettingsPage');

function Loading() {
  return (
    <p role="status" className="p-6 text-muted-foreground">
      Loading…
    </p>
  );
}

const PUBLIC: Record<string, { title: string; Page: Page }> = {
  '/login': { title: 'Log in', Page: LoginPage },
  '/signup': { title: 'Create your shop', Page: SignupPage },
  '/recover': { title: 'Reset password', Page: RecoverPage },
};

const SIGNED_IN: Record<string, Page> = {
  '/': DashboardPage,
  '/sell': SellPage,
  '/inventory': InventoryPage,
  '/products': ProductsPage,
  '/staff': StaffPage,
  '/activity': ActivityPage,
  '/products/import': ImportPage,
  '/settings': SettingsPage,
};

/** Signed-in screens. A screen the role can't use sends the user to their home screen. */
function SignedInRoutes({ pathname }: { pathname: string }) {
  const { user } = useMe();
  const item = NAV.find((i) => i.href === pathname);
  const Page = SIGNED_IN[pathname];
  const allowed = Boolean(item && Page && hasRole(user.role, item.minRole));

  useEffect(() => {
    if (!allowed) navigate(homeFor(user.role), { replace: true });
    else if (item) document.title = `${item.label} · ${APP_NAME}`;
  }, [allowed, item, user.role]);

  if (!allowed || !Page) return null;
  return (
    <AppShell>
      <Suspense fallback={<Loading />}>
        <Page />
      </Suspense>
    </AppShell>
  );
}

export function App() {
  const pathname = usePathname();
  const publicRoute = PUBLIC[pathname];

  useEffect(() => {
    if (publicRoute) document.title = `${publicRoute.title} · ${APP_NAME}`;
  }, [publicRoute]);

  if (publicRoute) {
    return (
      <Suspense fallback={<Loading />}>
        <publicRoute.Page />
      </Suspense>
    );
  }
  return (
    <SessionGate>
      <SignedInRoutes pathname={pathname} />
    </SessionGate>
  );
}
