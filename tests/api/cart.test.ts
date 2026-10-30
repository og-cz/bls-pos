import { describe, expect, it } from 'vitest';

import {
  addOne,
  cartTotals,
  reconcile,
  setQuantity,
  type CartProduct,
} from '../../src/shared/cart';

const latte: CartProduct = { id: 'latte', priceCents: 12_000, trackStock: true, stock: 2 };
const labor: CartProduct = { id: 'labor', priceCents: 30_000, trackStock: false, stock: 0 };
const all = new Map([latte, labor].map((p) => [p.id, p]));

describe('cart', () => {
  it('adds one per tap, up to the stock', () => {
    let cart = addOne([], latte);
    cart = addOne(cart, latte);
    cart = addOne(cart, latte);
    expect(cart).toEqual([{ productId: 'latte', quantity: 2 }]);
  });

  it('untracked items have no stock limit', () => {
    let cart = addOne([], labor);
    cart = setQuantity(cart, labor, 7);
    expect(cart).toEqual([{ productId: 'labor', quantity: 7 }]);
  });

  it('setting 0 removes a line, and quantities are whole and capped', () => {
    let cart = setQuantity([], latte, 5);
    expect(cart).toEqual([{ productId: 'latte', quantity: 2 }]);
    cart = setQuantity(cart, latte, 1.7);
    expect(cart).toEqual([{ productId: 'latte', quantity: 1 }]);
    expect(setQuantity(cart, latte, 0)).toEqual([]);
  });

  it('totals items and centavos', () => {
    const cart = [
      { productId: 'latte', quantity: 2 },
      { productId: 'labor', quantity: 1 },
    ];
    expect(cartTotals(cart, all)).toEqual({ items: 3, subtotalCents: 54_000 });
  });

  it('reconciles with fresh stock: gone products dropped, quantities trimmed', () => {
    const cart = [
      { productId: 'latte', quantity: 2 },
      { productId: 'gone', quantity: 1 },
    ];
    const fresh = new Map([['latte', { ...latte, stock: 1 }]]);
    expect(reconcile(cart, fresh)).toEqual([{ productId: 'latte', quantity: 1 }]);
  });
});
