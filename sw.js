// Keeps the app opening with no signal. Pages and the app's own files are saved on the phone the first time they load;
// everything cross-origin (the database) is left alone, so scores still go through the offline queue in the app.
// shortcut: one cache that is never cleaned of old hashed files, which is a few hundred KB per release; clean up when it matters.
const CACHE = 'clubhouse-shell';

async function saveShell() {
  const cache = await caches.open(CACHE);
  const res = await fetch('/', { cache: 'reload' });
  if (!res.ok) return;
  const html = await res.clone().text();
  await cache.put('/', res);
  const files = new Set(['/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/apple-touch-icon.png']);
  for (const m of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) files.add(m[1]);
  // Files with a hash in the name never change, so only fetch what is not saved yet.
  await Promise.all([...files].map(async (f) => { if (!(await cache.match(f))) await fetch(f).then((r) => (r.ok ? cache.put(f, r) : null)).catch(() => null); }));
}

self.addEventListener('install', (e) => { e.waitUntil(saveShell().then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Any page address is the same single-page app: try the network (fresh deploys), fall back to the saved copy.
    e.respondWith(
      fetch(req).then(
        (res) => { e.waitUntil(saveShell().catch(() => {})); return res; },
        () => caches.match('/').then((r) => r || Response.error()),
      ),
    );
    return;
  }
  // Files with a hash in the name never change: saved copy first, otherwise fetch and save.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy))); }
      return res;
    })),
  );
});
