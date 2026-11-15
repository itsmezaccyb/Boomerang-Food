// Offline cache so the home-screen app opens without a connection (online play still needs the server).
const CACHE = 'bb-v3';
const FILES = ['./', './index.html', './style.css', './config.js', './sim.js', './game.js', './manifest.webmanifest',
  './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png',
  "./sprites/avocado.svg","./sprites/boom.svg","./sprites/boomerang.svg","./sprites/brick.svg","./sprites/burger.svg","./sprites/crate.svg","./sprites/croissant.svg","./sprites/crown.svg","./sprites/crystal.svg","./sprites/cupcake.svg","./sprites/decoy.svg","./sprites/dizzy.svg","./sprites/donut.svg","./sprites/drill.svg","./sprites/fire.svg","./sprites/ghost.svg","./sprites/herb.svg","./sprites/hotdog.svg","./sprites/ice.svg","./sprites/mask.svg","./sprites/multi.svg","./sprites/pizza.svg","./sprites/riceball.svg","./sprites/shield.svg","./sprites/shoe.svg","./sprites/skull.svg","./sprites/sparkles.svg","./sprites/strawberry.svg","./sprites/sushi.svg","./sprites/taco.svg","./sprites/tree.svg","./sprites/trophy.svg","./sprites/watermelon.svg"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first (so updates show up), falling back to the cache when offline.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.endsWith('/healthz')) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
});
