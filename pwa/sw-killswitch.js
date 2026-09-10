// Emergency rollback only (FHQ_SW_KILLSWITCH=1). Normal builds still use sw.ts.
// Claim controlled windows before navigating, and navigate only after deleting old app
// caches. Otherwise a fresh registration can continuously reload a network-only page.
// Preserve unrelated feature caches and all club storage.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    let removed = false;
    for (const name of await caches.keys()) {
      if (/^fhq-(shell|art)-/.test(name) || name === 'fhq-meta') {
        removed = (await caches.delete(name)) || removed;
      }
    }
    let windows = [];
    if (removed) {
      await self.clients.claim();
      windows = await self.clients.matchAll({ type: 'window' });
    }
    await self.registration.unregister();
    for (const client of windows) {
      try { await client.navigate(client.url); } catch { /* Closed windows need no navigation. */ }
    }
  })());
});
