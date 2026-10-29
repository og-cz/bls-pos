import { Boxes, LayoutDashboard, Package, ScrollText, ShoppingCart, Users } from 'lucide-react';

import { useMe } from '@/app/session';
import { EmptyState, PageHeader } from '@/components/empty-state';

// Screens whose features land in later phases. Each says what will be here.

export function DashboardPage() {
  const { user } = useMe();
  return (
    <>
      <PageHeader title={`Hello, ${user.displayName}`} description="Your shop at a glance." />
      <EmptyState icon={LayoutDashboard} title="Your dashboard is on the way">
        Today&apos;s sales, income by day, top products and low stock will show here once you start
        selling.
      </EmptyState>
    </>
  );
}

export function SellPage() {
  return (
    <>
      <PageHeader title="Sell" />
      <EmptyState icon={ShoppingCart} title="Selling is coming soon">
        Tap products, take cash and print receipts from this screen.
      </EmptyState>
    </>
  );
}

export function InventoryPage() {
  return (
    <>
      <PageHeader title="Inventory" />
      <EmptyState icon={Boxes} title="No stock to show yet">
        Stock levels, restocks and deductions will be listed here.
      </EmptyState>
    </>
  );
}

export function ProductsPage() {
  return (
    <>
      <PageHeader title="Products" />
      <EmptyState icon={Package} title="No products yet">
        Adding products with prices and photos is coming next.
      </EmptyState>
    </>
  );
}

export function StaffPage() {
  return (
    <>
      <PageHeader title="Staff" />
      <EmptyState icon={Users} title="Your team">
        Add cashiers and admins here.
      </EmptyState>
    </>
  );
}

export function ActivityPage() {
  return (
    <>
      <PageHeader title="Activity" />
      <EmptyState icon={ScrollText} title="Activity log">
        Logins, staff changes and other important actions will be listed here.
      </EmptyState>
    </>
  );
}
