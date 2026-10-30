import {
  Boxes,
  LayoutDashboard,
  Package,
  ScrollText,
  Settings,
  ShoppingCart,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { hasRole, type Role } from '@shared/roles';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Lowest role that sees this item. The server checks again on every request. */
  minRole: Role;
  /** Shown in the phone tab bar (max 5); the rest live in the account menu. */
  tab: boolean;
  /** A screen reached from another screen, not listed in any menu. */
  hidden?: true;
  /** Listed at the bottom of the menu, below a divider (e.g. Settings). */
  bottom?: true;
};

export const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, minRole: 'admin', tab: true },
  { href: '/sell', label: 'Sell', icon: ShoppingCart, minRole: 'staff', tab: true },
  { href: '/inventory', label: 'Inventory', icon: Boxes, minRole: 'staff', tab: true },
  { href: '/products', label: 'Products', icon: Package, minRole: 'admin', tab: true },
  { href: '/staff', label: 'Staff', icon: Users, minRole: 'admin', tab: true },
  { href: '/activity', label: 'Activity', icon: ScrollText, minRole: 'admin', tab: false },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
    minRole: 'staff',
    tab: false,
    bottom: true,
  },
  {
    href: '/products/import',
    label: 'Import products',
    icon: Upload,
    minRole: 'admin',
    tab: false,
    hidden: true,
  },
];

export function navFor(role: Role): NavItem[] {
  return NAV.filter((item) => !item.hidden && hasRole(role, item.minRole));
}

/** Where each role lands after login: admins see the dashboard, staff start selling. */
export function homeFor(role: Role): string {
  return hasRole(role, 'admin') ? '/' : '/sell';
}
