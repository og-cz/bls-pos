import { useEffect, type JSX } from 'react';

import { LoginPage } from '@/features/auth/LoginPage';
import { RecoverPage } from '@/features/auth/RecoverPage';
import { SignupPage } from '@/features/auth/SignupPage';
import { ActivityPage } from '@/features/activity/ActivityPage';
import { DashboardPage, InventoryPage, SellPage } from '@/features/placeholders';
import { ProductsPage } from '@/features/products/ProductsPage';
import { StaffPage } from '@/features/staff/StaffPage';
import { navigate, usePathname } from '@/lib/router';
import { APP_NAME } from '@shared/app';
import { hasRole } from '@shared/roles';

import { AppShell } from './AppShell';
import { homeFor, NAV } from './nav';
import { SessionGate } from './SessionGate';
import { useMe } from './session';

type Page = () => JSX.Element;

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
      <Page />
    </AppShell>
  );
}

export function App() {
  const pathname = usePathname();
  const publicRoute = PUBLIC[pathname];

  useEffect(() => {
    if (publicRoute) document.title = `${publicRoute.title} · ${APP_NAME}`;
  }, [publicRoute]);

  if (publicRoute) return <publicRoute.Page />;
  return (
    <SessionGate>
      <SignedInRoutes pathname={pathname} />
    </SessionGate>
  );
}
