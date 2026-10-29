import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
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

export type Shop = typeof shops.$inferSelect;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
