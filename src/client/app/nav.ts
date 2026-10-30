import {
  Boxes,
  Globe,
  LayoutDashboard,
  LifeBuoy,
  Package,
  Palette,
  ReceiptText,
  ScrollText,
  Settings,
  ShoppingCart,
  Upload,
  UserRound,
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
  /** The menu section it is listed under. */
  group?: NavGroup;
};

export const NAV_GROUPS = {
  overview: 'Overview',
  selling: 'Selling',
  stock: 'Stock',
  shop: 'Shop',
} as const;
export type NavGroup = keyof typeof NAV_GROUPS;

/** Your own profile: at the top of the account menu for everyone. */
export const PROFILE_ITEM: NavItem = {
  href: '/profile',
  label: 'My profile',
  icon: UserRound,
  minRole: 'staff',
  tab: false,
  hidden: true,
};

export const NAV: NavItem[] = [
  // Listed in this order, under their group's heading; the phone tab bar takes the `tab` ones.
  {
    href: '/',
    label: 'Dashboard',
    icon: LayoutDashboard,
    minRole: 'admin',
    tab: true,
    group: 'overview',
  },
  {
    href: '/sell',
    label: 'Sell',
    icon: ShoppingCart,
    minRole: 'staff',
    tab: true,
    group: 'selling',
  },
  {
    href: '/sales',
    label: 'Sales',
    icon: ReceiptText,
    minRole: 'staff',
    tab: false,
    group: 'selling',
  },
  {
    href: '/inventory',
    label: 'Inventory',
    icon: Boxes,
    minRole: 'staff',
    tab: true,
    group: 'stock',
  },
  {
    href: '/products',
    label: 'Products',
    icon: Package,
    minRole: 'admin',
    tab: true,
    group: 'stock',
  },
  { href: '/staff', label: 'Staff', icon: Users, minRole: 'admin', tab: true, group: 'shop' },
  {
    href: '/shop-page',
    label: 'Shop page',
    icon: Globe,
    minRole: 'admin',
    tab: false,
    group: 'shop',
  },
  {
    href: '/branding',
    label: 'Branding',
    icon: Palette,
    minRole: 'admin',
    tab: false,
    group: 'shop',
  },
  {
    href: '/activity',
    label: 'Activity',
    icon: ScrollText,
    minRole: 'admin',
    tab: false,
    group: 'shop',
  },
  { href: '/help', label: 'Help', icon: LifeBuoy, minRole: 'staff', tab: false, bottom: true },
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
  PROFILE_ITEM,
];

export function navFor(role: Role): NavItem[] {
  return NAV.filter((item) => !item.hidden && hasRole(role, item.minRole));
}

/** Where each role lands after login: admins see the dashboard, staff start selling. */
export function homeFor(role: Role): string {
  return hasRole(role, 'admin') ? '/' : '/sell';
}
