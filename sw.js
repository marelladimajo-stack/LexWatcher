// LexWatcher service worker: makes the app installable and usable offline.
// Change VERSION whenever you upload a new version of the site.
const VERSION = "lexwatcher-v8";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).pathname.startsWith("/api/")) return; // live data always comes from the network
  // Pages: try the network first so updates show up, fall back to the saved copy offline.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put("/index.html", copy)); return r; })
      .catch(() => caches.match("/index.html")));
    return;
  }
  // Everything else: saved copy first, then network.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok && new URL(req.url).origin === location.origin) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return r;
  })));
});
