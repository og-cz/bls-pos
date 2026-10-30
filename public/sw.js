// bls POS service worker (Section 10): the app opens without internet, and product photos
// already seen stay available. API data is never cached here; the app keeps its own
// offline copy of the product list and clears everything on logout.

const SHELL = 'bls-shell-v1';
const ASSETS = 'bls-assets';
const MEDIA = 'bls-media';
const SHELL_FILES = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('bls-shell-') && k !== SHELL)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Logout asks for the private caches to go.
self.addEventListener('message', (event) => {
  if (event.data === 'clear-private') event.waitUntil(caches.delete(MEDIA));
});

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function networkFirstShell(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL);
      await cache.put('/', response.clone());
    }
    return response;
  } catch {
    // Offline: every screen is the same single-page app.
    const cached = await caches.match('/');
    return cached ?? Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
    return;
  }
  // Built files have a content hash in their name, so a cached copy is never stale.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(ASSETS, request));
    return;
  }
  // Media keys are never reused, so cached photos never change either. Private to the
  // shop: cleared on logout. Public shop pages are not cached.
  if (url.pathname.startsWith('/api/v1/media/')) {
    event.respondWith(cacheFirst(MEDIA, request));
  }
  // Everything else under /api goes straight to the network.
});
