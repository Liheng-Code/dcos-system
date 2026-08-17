self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request).catch(
      () => new Response("Network error — check your connection and try again.", {
        status: 503,
        statusText: "Network error",
        headers: { "Content-Type": "text/plain" },
      })
    )
  );
});
