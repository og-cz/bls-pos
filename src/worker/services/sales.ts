import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { entitlementsFor } from '@shared/entitlements';
import { hasRole } from '@shared/roles';
import type { CreateSaleInput, Receipt } from '@shared/schemas/sales';

import type { Db } from '../db/client';
import { isUniqueViolation } from '../db/errors';
import { newId } from '../db/id';
import { products, saleItems, sales, shops, stockMovements, users } from '../db/schema';
import type { Actor } from '../lib/actor';
import { ApiError } from '../lib/errors';

function isCheckViolation(err: unknown): boolean {
  const text = String(err instanceof Error && err.cause ? err.cause : err);
  return text.includes('CHECK constraint failed');
}

/** Same product twice in the cart → one line with the quantities added up. */
function mergeLines(items: CreateSaleInput['items']) {
  const qty = new Map<string, number>();
  for (const i of items) qty.set(i.productId, (qty.get(i.productId) ?? 0) + i.quantity);
  return [...qty].map(([productId, quantity]) => ({ productId, quantity }));
}

/**
 * Creates a sale (Section 5.3). The client sends only product ids and quantities; every
 * price comes from the database. One batch writes the sale (with the next number), its
 * lines, the stock decreases and the stock movements: all of it or none. The products
 * CHECK makes the batch fail if anything would oversell.
 */
export async function createSale(
  db: Db,
  shopId: string,
  actor: Actor,
  input: CreateSaleInput,
  now: number = Date.now(),
): Promise<Receipt> {
  const shop = await db.select({ plan: shops.plan }).from(shops).where(eq(shops.id, shopId)).get();
  const { paymentMethods } = entitlementsFor(shop?.plan ?? 'free');
  if (!paymentMethods.includes(input.paymentMethod)) {
    throw new ApiError(400, 'VALIDATION_ERROR', "That payment method isn't available.", {
      paymentMethod: 'Not available.',
    });
  }

  const lines = mergeLines(input.items);
  const ids = lines.map((l) => l.productId);
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      priceCents: products.priceCents,
      costCents: products.costCents,
      trackStock: products.trackStock,
    })
    .from(products)
    .where(
      and(eq(products.shopId, shopId), inArray(products.id, ids), isNull(products.archivedAt)),
    );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const unknown = ids.filter((id) => !byId.has(id));
  if (unknown.length) {
    throw new ApiError(
      400,
      'UNKNOWN_PRODUCT',
      'Some items are no longer for sale. Refresh and try again.',
      {
        items: unknown.join(','),
      },
    );
  }

  const priced = lines.map((l) => {
    const p = byId.get(l.productId);
    if (!p) throw new ApiError(400, 'UNKNOWN_PRODUCT', 'Unknown product.');
    return { ...l, product: p, lineTotalCents: p.priceCents * l.quantity };
  });
  const subtotalCents = priced.reduce((sum, l) => sum + l.lineTotalCents, 0);

  // Discounts are for admins and the owner; staff sell at the listed price.
  const discountCents = input.discountCents ?? 0;
  if (discountCents > 0 && !hasRole(actor.role, 'admin')) {
    throw new ApiError(403, 'FORBIDDEN', 'Only admins can give discounts.');
  }
  if (discountCents > subtotalCents) {
    throw new ApiError(400, 'VALIDATION_ERROR', "The discount can't be more than the total.", {
      discountCents: 'Too large.',
    });
  }
  const totalCents = subtotalCents - discountCents;

  let cashReceivedCents: number | null = null;
  let changeCents: number | null = null;
  if (input.paymentMethod === 'cash') {
    cashReceivedCents = input.cashReceivedCents ?? totalCents;
    if (cashReceivedCents < totalCents) {
      throw new ApiError(400, 'CASH_SHORT', 'The cash received is less than the total.', {
        cashReceivedCents: 'Less than the total.',
      });
    }
    changeCents = cashReceivedCents - totalCents;
  }

  const saleId = newId(now);
  const tracked = priced.filter((l) => l.product.trackStock);
  try {
    await db.batch([
      db.insert(sales).values({
        id: saleId,
        shopId,
        // Next number for this shop, worked out inside the same write so two tills
        // can't take the same one (D1 runs batches one at a time).
        number: sql`(SELECT coalesce(max(${sales.number}), 0) + 1 FROM ${sales} WHERE ${sales.shopId} = ${shopId})`,
        userId: actor.userId,
        subtotalCents,
        discountCents,
        totalCents,
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference ?? null,
        cashReceivedCents,
        changeCents,
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
        clientCreatedAt: input.clientCreatedAt ?? null,
      }),
      db.insert(saleItems).values(
        priced.map((l) => ({
          id: newId(now),
          saleId,
          shopId,
          productId: l.productId,
          nameSnapshot: l.product.name,
          unitPriceCents: l.product.priceCents,
          unitCostCents: l.product.costCents,
          quantity: l.quantity,
          lineTotalCents: l.lineTotalCents,
        })),
      ),
      ...tracked.map((l) =>
        db
          .update(products)
          .set({ stock: sql`${products.stock} - ${l.quantity}`, updatedAt: now })
          .where(and(eq(products.id, l.productId), eq(products.shopId, shopId))),
      ),
      ...(tracked.length
        ? [
            db.insert(stockMovements).values(
              tracked.map((l) => ({
                id: newId(now),
                shopId,
                productId: l.productId,
                userId: actor.userId,
                delta: -l.quantity,
                reason: 'sale' as const,
                saleId,
                createdAt: now,
              })),
            ),
          ]
        : []),
    ]);
  } catch (err) {
    if (isCheckViolation(err)) throw await stockError(db, shopId, tracked);
    if (isUniqueViolation(err, 'sales.idempotency_key')) {
      throw new ApiError(409, 'DUPLICATE_SALE', 'This sale was already recorded.');
    }
    throw err;
  }

  return getReceipt(db, shopId, actor, saleId);
}

/** 409 STOCK_INSUFFICIENT naming the products that ran short (Section 5.3 step 6). */
async function stockError(
  db: Db,
  shopId: string,
  lines: { productId: string; quantity: number; product: { name: string } }[],
) {
  const stock = await db
    .select({ id: products.id, stock: products.stock })
    .from(products)
    .where(
      and(
        eq(products.shopId, shopId),
        inArray(
          products.id,
          lines.map((l) => l.productId),
        ),
      ),
    );
  const left = new Map(stock.map((s) => [s.id, s.stock]));
  const short = lines.filter((l) => (left.get(l.productId) ?? 0) < l.quantity);
  const names = short.map((l) => `${l.product.name} (${String(left.get(l.productId) ?? 0)} left)`);
  return new ApiError(
    409,
    'STOCK_INSUFFICIENT',
    `Not enough stock for ${names.join(', ') || 'some items'}.`,
    Object.fromEntries(short.map((l) => [l.productId, String(left.get(l.productId) ?? 0)])),
  );
}

/** A sale as a receipt. Admins see any sale; staff only their own (Section 5.2). */
export async function getReceipt(
  db: Db,
  shopId: string,
  actor: Actor,
  saleId: string,
): Promise<Receipt> {
  const sale = await db
    .select({
      sale: sales,
      cashierName: users.displayName,
    })
    .from(sales)
    .innerJoin(users, and(eq(users.id, sales.userId), eq(users.shopId, sales.shopId)))
    .where(and(eq(sales.id, saleId), eq(sales.shopId, shopId)))
    .get();
  if (!sale || (!hasRole(actor.role, 'admin') && sale.sale.userId !== actor.userId)) {
    throw new ApiError(404, 'NOT_FOUND', 'No such sale.');
  }
  const lines = await db
    .select()
    .from(saleItems)
    .where(and(eq(saleItems.saleId, saleId), eq(saleItems.shopId, shopId)))
    .orderBy(saleItems.id);
  const s = sale.sale;
  return {
    id: s.id,
    number: s.number,
    status: s.status,
    createdAt: s.createdAt,
    cashier: { id: s.userId, displayName: sale.cashierName },
    lines: lines.map((l) => ({
      productId: l.productId,
      name: l.nameSnapshot,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      lineTotalCents: l.lineTotalCents,
    })),
    subtotalCents: s.subtotalCents,
    discountCents: s.discountCents,
    totalCents: s.totalCents,
    paymentMethod: s.paymentMethod,
    paymentReference: s.paymentReference,
    cashReceivedCents: s.cashReceivedCents,
    changeCents: s.changeCents,
    voidReason: s.voidReason,
  };
}
