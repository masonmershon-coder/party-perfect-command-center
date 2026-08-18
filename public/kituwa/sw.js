self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open("kituwa-offline-v1");
      const offline = await cache.match("/kituwa/offline");
      if (offline) return offline;
      return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
    }),
  );
});
