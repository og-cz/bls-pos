import { useEffect, type JSX } from 'react';

import { LoginPage } from '@/features/auth/LoginPage';
import { RecoverPage } from '@/features/auth/RecoverPage';
import { SignupPage } from '@/features/auth/SignupPage';
import { HomePage } from '@/features/home/HomePage';
import { navigate, usePathname } from '@/lib/router';
import { APP_NAME } from '@shared/app';

const ROUTES: Record<string, { title: string; Page: () => JSX.Element }> = {
  '/': { title: APP_NAME, Page: HomePage },
  '/login': { title: `Log in · ${APP_NAME}`, Page: LoginPage },
  '/signup': { title: `Create your shop · ${APP_NAME}`, Page: SignupPage },
  '/recover': { title: `Reset password · ${APP_NAME}`, Page: RecoverPage },
};

export function App() {
  const pathname = usePathname();
  const route = ROUTES[pathname];

  useEffect(() => {
    if (route) document.title = route.title;
    else navigate('/', { replace: true });
  }, [route]);

  if (!route) return null;
  return <route.Page />;
}
