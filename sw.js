const CACHE_NAME = "reception-crm-v1";
const ASSETS = ["./", "./index.html", "./app.js", "./manifest.json"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first pour les données (Supabase), cache-first pour les fichiers de l'appli
self.addEventListener("fetch", event => {
  const url = event.request.url;
  if (url.includes("supabase.co")) return; // laisser passer les appels API tels quels
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
