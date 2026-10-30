// The sell screen's cart (Phase 4). Only product ids and quantities: the server prices
// the sale, these totals are just what the cashier sees while ringing it up.

export type CartLine = { productId: string; quantity: number };
export type Cart = CartLine[];

export type CartProduct = {
  id: string;
  priceCents: number;
  trackStock: boolean;
  stock: number;
};

export const MAX_LINE_QUANTITY = 10_000;

/** Most of this product the cart may hold: its stock if tracked. */
export function maxQuantity(product: CartProduct): number {
  return product.trackStock
    ? Math.max(0, Math.min(product.stock, MAX_LINE_QUANTITY))
    : MAX_LINE_QUANTITY;
}

export function quantityOf(cart: Cart, productId: string): number {
  return cart.find((l) => l.productId === productId)?.quantity ?? 0;
}

/** Sets a line's quantity (0 removes it), never above what's in stock. */
export function setQuantity(cart: Cart, product: CartProduct, quantity: number): Cart {
  const q = Math.max(0, Math.min(Math.floor(quantity), maxQuantity(product)));
  const exists = cart.some((l) => l.productId === product.id);
  if (q === 0) return cart.filter((l) => l.productId !== product.id);
  if (!exists) return [...cart, { productId: product.id, quantity: q }];
  return cart.map((l) => (l.productId === product.id ? { ...l, quantity: q } : l));
}

/** One more of a product (a tap on its tile). Returns the same cart if out of stock. */
export function addOne(cart: Cart, product: CartProduct): Cart {
  const current = quantityOf(cart, product.id);
  if (current >= maxQuantity(product)) return cart;
  return setQuantity(cart, product, current + 1);
}

export function cartTotals(cart: Cart, products: ReadonlyMap<string, CartProduct>) {
  let items = 0;
  let subtotalCents = 0;
  for (const line of cart) {
    const p = products.get(line.productId);
    if (!p) continue;
    items += line.quantity;
    subtotalCents += p.priceCents * line.quantity;
  }
  return { items, subtotalCents };
}

/** Drops lines whose product is gone and trims quantities to current stock. */
export function reconcile(cart: Cart, products: ReadonlyMap<string, CartProduct>): Cart {
  return cart.flatMap((line) => {
    const p = products.get(line.productId);
    if (!p) return [];
    const q = Math.min(line.quantity, maxQuantity(p));
    return q > 0 ? [{ ...line, quantity: q }] : [];
  });
}
