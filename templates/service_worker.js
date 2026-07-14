const CACHE_NAME = "beer-journal-shell-v2";
const OFFLINE_URL = "/static/pwa/offline.html";
const APP_SHELL = [
  "/static/css/app.css?v=20260714-e2",
  "/static/js/app.js?v=20260714-e2",
  "/static/manifest.webmanifest",
  "/static/icons/beer-journal-192.png?v=20260714-e2",
  "/static/icons/beer-journal-512.png?v=20260714-e2",
  "/static/icons/beer-journal-maskable-512.png?v=20260714-e2",
  OFFLINE_URL,
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("beer-journal-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/photos/")) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  if (APP_SHELL.includes(`${url.pathname}${url.search}`)) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
  }
});
