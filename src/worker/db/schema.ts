import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

import { BUSINESS_TYPES, type BusinessType } from '../../shared/business';
import { ROLES, type Role } from '../../shared/roles';

// Conventions (master prompt §4):
// - IDs are random strings (UUIDv7), never auto-increment numbers.
// - Money is integer centavos. Timestamps are UTC epoch milliseconds.
// - Every tenant-owned table has shop_id and an index on it.

export { BUSINESS_TYPES, type BusinessType, ROLES, type Role };

export const shops = sqliteTable(
  'shops',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    businessType: text('business_type', { enum: BUSINESS_TYPES }).notNull(),
    bio: text('bio'),
    currency: text('currency').notNull().default('PHP'),
    timezone: text('timezone').notNull().default('Asia/Manila'),
    plan: text('plan').notNull().default('free'),
    themeJson: text('theme_json').notNull(),
    logoKey: text('logo_key'),
    coverKey: text('cover_key'),
    storefrontEnabled: integer('storefront_enabled', { mode: 'boolean' }).notNull().default(false),
    storefrontShowPrices: integer('storefront_show_prices', { mode: 'boolean' })
      .notNull()
      .default(true),
    storefrontShowStock: integer('storefront_show_stock', { mode: 'boolean' })
      .notNull()
      .default(false),
    onboardingStep: integer('onboarding_step').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => [
    check(
      'shops_business_type',
      sql`${t.businessType} IN ('cafe','retail','sari_sari','salon','food_stall','other')`,
    ),
  ],
);

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    shopId: text('shop_id')
      .notNull()
      .references(() => shops.id),
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    avatarKey: text('avatar_key'),
    role: text('role', { enum: ROLES }).notNull(),
    // Format: pbkdf2$sha256$<iterations>$<salt b64>$<hash b64>
    passwordHash: text('password_hash').notNull(),
    // AES-GCM encrypted; NULL when 2FA is off.
    totpSecretEnc: text('totp_secret_enc'),
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: integer('locked_until'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    unique('users_shop_username').on(t.shopId, t.username),
    index('users_shop_id').on(t.shopId),
    check('users_role', sql`${t.role} IN ('owner','admin','staff')`),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    // SHA-256 of the cookie token. The raw token is never stored.
    tokenHash: text('token_hash').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    shopId: text('shop_id').notNull(),
    userAgent: text('user_agent'),
    ipHash: text('ip_hash'),
    createdAt: integer('created_at').notNull(),
    lastSeenAt: integer('last_seen_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at'),
  },
  (t) => [index('sessions_shop_id').on(t.shopId), index('sessions_user_id').on(t.userId)],
);

// Owner password reset without email (Section 7.12). Codes are stored hashed.
export const recoveryCodes = sqliteTable(
  'recovery_codes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    codeHash: text('code_hash').notNull(),
    usedAt: integer('used_at'),
  },
  (t) => [index('recovery_codes_user_id').on(t.userId)],
);

// Failed-login counters per fixed 15-minute window (Section 7.3).
// key is 'ip:<hash>' or 'user:<shopSlug>:<username>'.
export const loginAttempts = sqliteTable(
  'login_attempts',
  {
    key: text('key').notNull(),
    windowStart: integer('window_start').notNull(),
    count: integer('count').notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

// Who did what, when (Section 7.13). details_json never holds passwords, tokens or codes.
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    shopId: text('shop_id').notNull(),
    userId: text('user_id'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    detailsJson: text('details_json'),
    ipHash: text('ip_hash'),
    createdAt: integer('created_at').notNull(),
  },
  // Newest-first listing per shop; ids are UUIDv7 so they sort by time too.
  (t) => [index('audit_log_shop_id').on(t.shopId, t.id)],
);

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    shopId: text('shop_id')
      .notNull()
      .references(() => shops.id),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    unique('categories_shop_name').on(t.shopId, t.name),
    index('categories_shop_id').on(t.shopId),
  ],
);

export const products = sqliteTable(
  'products',
  {
    id: text('id').primaryKey(),
    shopId: text('shop_id')
      .notNull()
      .references(() => shops.id),
    categoryId: text('category_id').references(() => categories.id),
    name: text('name').notNull(),
    // Unique per shop when present (partial index below).
    sku: text('sku'),
    // Money is integer centavos, never floating point.
    priceCents: integer('price_cents').notNull(),
    // Admin-only: never sent to staff (Section 7.4).
    costCents: integer('cost_cents'),
    trackStock: integer('track_stock', { mode: 'boolean' }).notNull().default(true),
    stock: integer('stock').notNull().default(0),
    lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
    imageKey: text('image_key'),
    showOnStorefront: integer('show_on_storefront', { mode: 'boolean' }).notNull().default(true),
    // "Remove product" = archive, so sales history stays intact.
    archivedAt: integer('archived_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('products_shop_sku')
      .on(t.shopId, t.sku)
      .where(sql`${t.sku} IS NOT NULL`),
    index('products_shop_id').on(t.shopId),
    check('products_price', sql`${t.priceCents} >= 0`),
    check('products_cost', sql`${t.costCents} >= 0`),
    // The database itself refuses to oversell tracked items (Section 5.3).
    check('products_stock', sql`${t.trackStock} = 0 OR ${t.stock} >= 0`),
  ],
);

export const STOCK_REASONS = [
  'restock',
  'sale',
  'void',
  'damaged',
  'expired',
  'used',
  'lost',
  'correction',
] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

// Every stock change: who, when, how many, why (Section 1.2).
export const stockMovements = sqliteTable(
  'stock_movements',
  {
    id: text('id').primaryKey(),
    shopId: text('shop_id').notNull(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    // +restock, -sale, -deduct
    delta: integer('delta').notNull(),
    reason: text('reason', { enum: STOCK_REASONS }).notNull(),
    note: text('note'),
    saleId: text('sale_id'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('stock_movements_shop_id').on(t.shopId, t.id),
    index('stock_movements_product_id').on(t.productId),
    check(
      'stock_movements_reason',
      sql`${t.reason} IN ('restock','sale','void','damaged','expired','used','lost','correction')`,
    ),
  ],
);

export const SALE_STATUSES = ['completed', 'voided'] as const;

// Sales are never deleted, only voided (Section 4). Numbers are sequential per shop and
// never reused; a voided sale keeps its number (Section 7.16).
export const sales = sqliteTable(
  'sales',
  {
    id: text('id').primaryKey(),
    shopId: text('shop_id').notNull(),
    number: integer('number').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    subtotalCents: integer('subtotal_cents').notNull(),
    discountCents: integer('discount_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    // 'cash' | 'other_manual' in Free; more in Paid.
    paymentMethod: text('payment_method').notNull(),
    paymentReference: text('payment_reference'),
    cashReceivedCents: integer('cash_received_cents'),
    changeCents: integer('change_cents'),
    // Stops a retried or offline-synced sale from being recorded twice.
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status', { enum: SALE_STATUSES }).notNull().default('completed'),
    voidedBy: text('voided_by'),
    voidedAt: integer('voided_at'),
    voidReason: text('void_reason'),
    createdAt: integer('created_at').notNull(),
    // Time on the device, for sales made offline.
    clientCreatedAt: integer('client_created_at'),
  },
  (t) => [
    unique('sales_shop_idempotency').on(t.shopId, t.idempotencyKey),
    unique('sales_shop_number').on(t.shopId, t.number),
    index('sales_shop_created').on(t.shopId, t.createdAt),
    index('sales_shop_user_created').on(t.shopId, t.userId, t.createdAt),
    check('sales_status', sql`${t.status} IN ('completed','voided')`),
    check(
      'sales_amounts',
      sql`${t.subtotalCents} >= 0 AND ${t.discountCents} >= 0 AND ${t.totalCents} >= 0 AND ${t.discountCents} <= ${t.subtotalCents}`,
    ),
  ],
);

export const saleItems = sqliteTable(
  'sale_items',
  {
    id: text('id').primaryKey(),
    saleId: text('sale_id')
      .notNull()
      .references(() => sales.id),
    shopId: text('shop_id').notNull(),
    productId: text('product_id').notNull(),
    // Name and prices at the time of sale, from the server, never from the client.
    nameSnapshot: text('name_snapshot').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    unitCostCents: integer('unit_cost_cents'),
    quantity: integer('quantity').notNull(),
    lineTotalCents: integer('line_total_cents').notNull(),
  },
  (t) => [
    index('sale_items_sale_id').on(t.saleId),
    index('sale_items_shop_product').on(t.shopId, t.productId),
    check('sale_items_quantity', sql`${t.quantity} > 0`),
  ],
);

// One row per shop per local day (shop timezone), filled by the nightly job and refreshed
// when a sale of that day is voided, so dashboards never scan all sales (Section 4).
export const dailySummaries = sqliteTable(
  'daily_summaries',
  {
    shopId: text('shop_id').notNull(),
    // 'YYYY-MM-DD' in the shop's timezone.
    day: text('day').notNull(),
    salesCount: integer('sales_count').notNull(),
    grossCents: integer('gross_cents').notNull(),
    voidedCents: integer('voided_cents').notNull(),
    costCents: integer('cost_cents').notNull(),
  },
  (t) => [primaryKey({ columns: [t.shopId, t.day] })],
);

export type Shop = typeof shops.$inferSelect;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Sale = typeof sales.$inferSelect;

/**
 * Daily close, Z-reading style (Section 7.16). Written once and never changed: database
 * triggers (migration 0007) refuse edits and deletes here, and refuse new sales or voids
 * inside a closed day's window [start_ms, end_ms).
 */
export const dailyClosings = sqliteTable(
  'daily_closings',
  {
    id: text('id').primaryKey(),
    shopId: text('shop_id')
      .notNull()
      .references(() => shops.id),
    day: text('day').notNull(),
    // The day's window in UTC milliseconds, in the shop's timezone when it was closed.
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
    firstSaleNumber: integer('first_sale_number'),
    lastSaleNumber: integer('last_sale_number'),
    salesCount: integer('sales_count').notNull(),
    grossCents: integer('gross_cents').notNull(),
    voidedCount: integer('voided_count').notNull(),
    voidedCents: integer('voided_cents').notNull(),
    // { [paymentMethod]: { count, cents } } for completed sales.
    paymentsJson: text('payments_json').notNull(),
    closedBy: text('closed_by')
      .notNull()
      .references(() => users.id),
    closedAt: integer('closed_at').notNull(),
  },
  (t) => [
    unique('daily_closings_shop_day').on(t.shopId, t.day),
    index('daily_closings_shop_window').on(t.shopId, t.startMs),
  ],
);
