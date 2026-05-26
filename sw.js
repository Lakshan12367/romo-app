// ════════════════════════════════════════
// ROMO Service Worker
// Intercepts the Web Share Target POST so the
// page is NEVER reloaded — BLE stays alive.
// ════════════════════════════════════════

const CACHE_NAME = 'romo-v2';
const PRECACHE   = ['/', '/index.html', '/manifest.json', '/icon-512.png'];

// ── Install: cache shell ──────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: handle Share Target POST ───
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Web Share Target sends a POST to /?share-target
  if (e.request.method === 'POST' && url.pathname === '/' && url.searchParams.has('share-target')) {
    e.respondWith(handleShareTarget(e.request));
    return;
  }

  // For GET requests: cache-first for shell, network-first for rest
  if (e.request.method === 'GET') {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const title    = formData.get('title') || '';
    const text     = formData.get('text')  || '';
    const url      = formData.get('url')   || text || '';

    // Post message to ALL open ROMO clients — no reload needed
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    if (clients.length > 0) {
      clients[0].postMessage({ type: 'SHARE_RECEIVED', title, text, url });
      clients[0].focus();
    } else {
      // App is closed — store in cache, pick up on next open
      const cache = await caches.open(CACHE_NAME);
      await cache.put(
        '/__pending-share__',
        new Response(JSON.stringify({ title, text, url }), {
          headers: { 'Content-Type': 'application/json' }
        })
      );
    }
  } catch (err) {
    console.error('SW share handler error:', err);
  }

  // Always redirect back to the app (no URL params, no reload)
  return Response.redirect('/', 303);
}
