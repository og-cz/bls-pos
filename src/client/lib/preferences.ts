import { useSyncExternalStore } from 'react';

// Display preferences for this device (Settings screen). They are about how this screen
// looks, not shop data, so they live in the browser, not on the server. A cashier's
// tablet and the owner's PC can each be set up their own way. The shop's brand colors
// (Phase 6) are separate and shared by everyone in the shop.

export const THEMES = ['system', 'light', 'dark'] as const;
export const PRODUCT_VIEWS = ['list', 'compact', 'tiles', 'large-tiles'] as const;
export const MENU_SIDES = ['left', 'right'] as const;
export const TEXT_SIZES = ['normal', 'large'] as const;

export type Preferences = {
  theme: (typeof THEMES)[number];
  productView: (typeof PRODUCT_VIEWS)[number];
  menuSide: (typeof MENU_SIDES)[number];
  /** PC and tablet: show only icons in the side menu. */
  menuCollapsed: boolean;
  textSize: (typeof TEXT_SIZES)[number];
};

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  productView: 'list',
  menuSide: 'left',
  menuCollapsed: false,
  textSize: 'normal',
};

const KEY = 'bls:preferences';
const listeners = new Set<() => void>();

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Reads what's stored, keeping only known values, so a bad entry can't break the app. */
function read(): Preferences {
  let raw: Partial<Record<keyof Preferences, unknown>> = {};
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as typeof raw;
  } catch {
    // Storage blocked or corrupt: use defaults.
  }
  const d = DEFAULT_PREFERENCES;
  return {
    theme: oneOf(raw.theme, THEMES, d.theme),
    productView: oneOf(raw.productView, PRODUCT_VIEWS, d.productView),
    menuSide: oneOf(raw.menuSide, MENU_SIDES, d.menuSide),
    menuCollapsed: typeof raw.menuCollapsed === 'boolean' ? raw.menuCollapsed : d.menuCollapsed,
    textSize: oneOf(raw.textSize, TEXT_SIZES, d.textSize),
  };
}

let current = read();

export function getPreferences(): Preferences {
  return current;
}

export function setPreferences(patch: Partial<Preferences>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Not saved (private mode); it still applies until the page reloads.
  }
  applyPreferences();
  listeners.forEach((l) => {
    l();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, getPreferences);
}

const darkQuery =
  typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

// The shop's own look (Branding). "Automatic" here follows it, then the device.
let shopMode: 'light' | 'dark' | 'system' = 'system';

export function setShopMode(mode: 'light' | 'dark' | 'system') {
  shopMode = mode;
  applyPreferences();
}

/** Puts the theme and text size on <html>. Called at start-up and on every change. */
export function applyPreferences() {
  const root = document.documentElement;
  const automatic = shopMode === 'system' ? darkQuery?.matches === true : shopMode === 'dark';
  const dark = current.theme === 'dark' || (current.theme === 'system' && automatic);
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  root.classList.toggle('text-large', current.textSize === 'large');
}

// Follow the phone or PC switching between light and dark while "System" is chosen.
darkQuery?.addEventListener('change', () => {
  if (current.theme === 'system') applyPreferences();
});
