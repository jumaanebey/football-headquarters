// Rollback worker. Deploying this file as /sw.js (FHQ_SW_KILLSWITCH=1 npm run build) makes every
// installed worker replace itself with one that deletes all fhq-* caches, unregisters, and
// reloads open pages onto the plain network — no player is stranded on obsolete cached code.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (/^fhq-(shell|art)-/.test(name)) await caches.delete(name);
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
  })());
});
