import type { BusinessType } from './business';

// Sample products per kind of shop (Section 8.1 "Add sample products"), so a new owner can
// try a sale in seconds. Their SKUs start with SAMPLE- so they can be removed in one tap.

export const SAMPLE_SKU_PREFIX = 'SAMPLE-';

export type SampleProduct = {
  name: string;
  category: string;
  priceCents: number;
  costCents: number;
  /** null = made to order (stock not tracked). */
  stock: number | null;
};

export const SAMPLE_PRODUCTS: Record<BusinessType, SampleProduct[]> = {
  cafe: [
    {
      name: 'Hot Americano',
      category: 'Coffee',
      priceCents: 12_000,
      costCents: 4_500,
      stock: null,
    },
    { name: 'Iced Latte', category: 'Coffee', priceCents: 15_000, costCents: 6_000, stock: null },
    {
      name: 'Caramel Macchiato',
      category: 'Coffee',
      priceCents: 17_000,
      costCents: 7_000,
      stock: null,
    },
    {
      name: 'Chocolate Chip Cookie',
      category: 'Pastries',
      priceCents: 6_000,
      costCents: 2_500,
      stock: 24,
    },
    { name: 'Ensaymada', category: 'Pastries', priceCents: 7_500, costCents: 3_000, stock: 12 },
    { name: 'Bottled Water', category: 'Drinks', priceCents: 3_000, costCents: 1_500, stock: 48 },
  ],
  retail: [
    { name: 'Engine Oil 1L', category: 'Oils', priceCents: 35_000, costCents: 25_000, stock: 20 },
    { name: 'Spark Plug', category: 'Parts', priceCents: 18_000, costCents: 11_000, stock: 30 },
    { name: 'Brake Pad Set', category: 'Parts', priceCents: 65_000, costCents: 42_000, stock: 8 },
    { name: 'Chain Lube', category: 'Care', priceCents: 22_000, costCents: 15_000, stock: 12 },
    {
      name: 'Helmet Visor',
      category: 'Accessories',
      priceCents: 45_000,
      costCents: 28_000,
      stock: 5,
    },
    {
      name: 'Phone Holder',
      category: 'Accessories',
      priceCents: 25_000,
      costCents: 14_000,
      stock: 10,
    },
  ],
  sari_sari: [
    { name: 'Instant Noodles', category: 'Food', priceCents: 1_500, costCents: 1_100, stock: 60 },
    { name: 'Canned Sardines', category: 'Food', priceCents: 2_800, costCents: 2_200, stock: 36 },
    { name: 'Softdrink 1.5L', category: 'Drinks', priceCents: 7_500, costCents: 6_200, stock: 24 },
    {
      name: '3-in-1 Coffee Sachet',
      category: 'Drinks',
      priceCents: 1_000,
      costCents: 750,
      stock: 100,
    },
    {
      name: 'Laundry Bar Soap',
      category: 'Household',
      priceCents: 2_500,
      costCents: 1_900,
      stock: 30,
    },
    { name: 'Load ₱50', category: 'Load', priceCents: 5_000, costCents: 4_800, stock: null },
  ],
  salon: [
    { name: 'Haircut', category: 'Hair', priceCents: 15_000, costCents: 0, stock: null },
    { name: 'Hair Color', category: 'Hair', priceCents: 80_000, costCents: 25_000, stock: null },
    { name: 'Manicure', category: 'Nails', priceCents: 12_000, costCents: 3_000, stock: null },
    { name: 'Pedicure', category: 'Nails', priceCents: 15_000, costCents: 3_500, stock: null },
    {
      name: 'Shampoo 250ml',
      category: 'Products',
      priceCents: 28_000,
      costCents: 18_000,
      stock: 10,
    },
    { name: 'Hair Serum', category: 'Products', priceCents: 35_000, costCents: 22_000, stock: 8 },
  ],
  food_stall: [
    {
      name: 'Pork Siomai (4 pcs)',
      category: 'Snacks',
      priceCents: 6_000,
      costCents: 2_800,
      stock: null,
    },
    {
      name: 'Fish Balls (10 pcs)',
      category: 'Snacks',
      priceCents: 2_000,
      costCents: 900,
      stock: null,
    },
    { name: 'Rice Meal', category: 'Meals', priceCents: 9_500, costCents: 4_500, stock: null },
    { name: 'Extra Rice', category: 'Meals', priceCents: 2_000, costCents: 800, stock: null },
    { name: 'Gulaman', category: 'Drinks', priceCents: 2_500, costCents: 800, stock: null },
    { name: 'Bottled Water', category: 'Drinks', priceCents: 2_000, costCents: 1_200, stock: 24 },
  ],
  other: [
    { name: 'Sample Item A', category: 'General', priceCents: 10_000, costCents: 6_000, stock: 20 },
    {
      name: 'Sample Item B',
      category: 'General',
      priceCents: 25_000,
      costCents: 15_000,
      stock: 10,
    },
    { name: 'Sample Service', category: 'Services', priceCents: 50_000, costCents: 0, stock: null },
  ],
};
