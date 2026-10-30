import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

// Guided tours (Section 8.2). Each runs once per person on this device and can be
// replayed from Help. Steps point at data-tour="…" anchors; on a phone, a screen that
// lives in the menu points at the menu button instead.

export type TourKind = 'admin' | 'staff';

/** The first anchor that is actually on screen (the side menu is hidden on phones). */
function visible(...anchors: string[]): Element | undefined {
  for (const a of anchors) {
    for (const el of document.querySelectorAll(`[data-tour="${a}"]`)) {
      if (el.getClientRects().length > 0) return el;
    }
  }
  return undefined;
}

function step(anchors: string[], title: string, description: string): DriveStep {
  return {
    element: () => visible(...anchors) ?? document.body,
    popover: { title, description },
  };
}

const TOURS: Record<TourKind, () => DriveStep[]> = {
  admin: () => [
    {
      popover: {
        title: 'Welcome to your shop',
        description: 'A quick look around. It takes a minute; you can skip it any time.',
      },
    },
    step(['nav/'], 'Dashboard', "Today's sales, profit, best sellers and low stock, at a glance."),
    step(
      ['nav/products', 'menu-button'],
      'Products',
      'Add what you sell, with a photo, price and stock. Import a spreadsheet to add many at once.',
    ),
    step(
      ['nav/inventory', 'menu-button'],
      'Inventory',
      'Restock when deliveries arrive. Staff can take stock out with a reason.',
    ),
    step(
      ['nav/staff', 'menu-button'],
      'Staff',
      'Give each person their own login. Staff can sell; only you and admins see costs and reports.',
    ),
    step(
      ['nav/branding', 'menu-button'],
      'Branding',
      'Your colors, logo, cover photo and font, on every screen.',
    ),
    step(
      ['nav/shop-page', 'menu-button'],
      'Shop page',
      'A public page with your products and a QR code to share with customers.',
    ),
    step(
      ['account'],
      'Your account',
      'Your profile, Settings and Help are here. Replay this tour from Help.',
    ),
  ],
  staff: () => [
    {
      popover: {
        title: 'Ready to sell',
        description: 'Here is how a sale works. You can skip this any time.',
      },
    },
    step(
      ['sell-search'],
      'Find a product',
      'Type a name or SKU, or scan a barcode. Press Enter to add the only match.',
    ),
    step(['sell-grid'], 'Tap to add', 'Each tap adds one. Photos help tell similar items apart.'),
    step(
      ['sell-cart'],
      'Cart and Charge',
      'Change quantities here, then Charge. Pick Cash for quick amounts and the change to give.',
    ),
    step(
      ['nav/inventory', 'menu-button'],
      'Take out stock',
      'Damaged or used an item? Deduct it in Inventory with a reason, so the count stays right.',
    ),
  ],
};

const seenKey = (userId: string, kind: TourKind) => `bls:tour:${kind}:${userId}`;

export function hasSeenTour(userId: string, kind: TourKind): boolean {
  try {
    return localStorage.getItem(seenKey(userId, kind)) === '1';
  } catch {
    return true; // Storage blocked: don't keep showing it.
  }
}

/** Starts a tour now (from Help, or automatically the first time). */
export function startTour(userId: string, kind: TourKind): void {
  try {
    localStorage.setItem(seenKey(userId, kind), '1');
  } catch {
    // Not remembered; it may show again next time.
  }
  driver({
    showProgress: true,
    popoverClass: 'bls-tour',
    allowClose: true,
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    steps: TOURS[kind](),
  }).drive();
}
