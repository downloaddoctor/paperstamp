/* Kill switch for the retired PaperStamp service worker. Browsers that installed the old
   sw.js keep serving its cache-first copy until a new worker replaces it. This file keeps
   the same URL, takes over, wipes every cache, unregisters itself and reloads open pages
   once. Nothing registers it any more, so it is a one-time cleanup for old visitors. */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const all = await self.clients.matchAll({ type: 'window' });
      for (const c of all) c.navigate(c.url);
    })()
  );
});
