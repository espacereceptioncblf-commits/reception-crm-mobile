const CACHE_NAME = "reception-crm-v8";
const ASSETS = ["./", "./index.html", "./app.js", "./manifest.json", "./logo.png"];

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

// Network-first pour tout : on essaie toujours d'aller chercher la version la
// plus récente en ligne, et on ne retombe sur le cache qu'en cas de perte de
// réseau (mode hors-ligne). Évite de rester bloqué sur une ancienne version
// de l'appli après une mise à jour de app.js.
self.addEventListener("fetch", event => {
  const url = event.request.url;
  if (url.includes("supabase.co")) return; // laisser passer les appels API tels quels
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
