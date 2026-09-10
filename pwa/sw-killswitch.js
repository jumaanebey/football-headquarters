// Rollback worker. Deploying this file as /sw.js (FHQ_SW_KILLSWITCH=1 npm run build) makes every
// installed worker replace itself with one that deletes all fhq-* caches, unregisters, and — only
// for windows that were actually running cached code — re-navigates them onto the plain network.
// No player is stranded on obsolete cached code, and unrelated caches and localStorage are untouched.
//
// Windows are claimed before navigating because WindowClient.navigate() only works on clients this
// worker controls. The navigation is conditional on having deleted at least one fhq-* cache:
// while the kill switch stays deployed every fresh visit registers it again, and an unconditional
// navigate would then reload those visitors in a loop.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    let removed = 0;
    for (const name of await caches.keys()) if (name.startsWith('fhq-')) { await caches.delete(name); removed++; }
    let windows = [];
    if (removed) { await self.clients.claim(); windows = await self.clients.matchAll({ type: 'window' }); }
    await self.registration.unregister();
    for (const client of windows) { try { await client.navigate(client.url); } catch { /* a window that cannot be navigated picks up the network copy on its next visit */ } }
  })());
});
