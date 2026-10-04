// DCOS service worker.
//
// Everything outside the Field App behaves as before: straight to the network,
// with a plain 503 when there is none.
//
// The Field App (/field) must open with no signal, so its page and the static
// files that page loads are kept in a cache. The network is always tried
// first; the cache is only the fallback. Nothing from /api or from Supabase
// is ever cached here: report data lives in IndexedDB, managed by the app.

const FIELD_CACHE = "dcos-field-v1";
const FIELD_PATH = "/field";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("dcos-field-") && n !== FIELD_CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

const networkError = () =>
  new Response("Network error — check your connection and try again.", {
    status: 503,
    statusText: "Network error",
    headers: { "Content-Type": "text/plain" },
  });

const isFieldPage = (url) => url.pathname === FIELD_PATH || url.pathname.startsWith(FIELD_PATH + "/");

// Static files a page needs to render: build output, icons, the manifest.
const isStaticAsset = (url) =>
  url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/field/manifest.json";

async function requestedByFieldApp(event) {
  if (!event.clientId) return false;
  const client = await self.clients.get(event.clientId);
  return !!client && isFieldPage(new URL(client.url));
}

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(FIELD_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(cacheKey ?? request, response.clone());
    return response;
  } catch {
    return (await cache.match(cacheKey ?? request)) ?? networkError();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (request.method === "GET" && sameOrigin) {
    // Opening the Field App: one cached copy of the page, whatever the query string.
    if (request.mode === "navigate" && isFieldPage(url)) {
      event.respondWith(networkFirst(request, FIELD_PATH));
      return;
    }
    // Static files and framework data requested by the Field App.
    if (isStaticAsset(url) || (isFieldPage(url) && request.mode !== "navigate")) {
      event.respondWith(
        (async () => {
          if (isFieldPage(url) || (await requestedByFieldApp(event))) return networkFirst(request);
          return fetch(request).catch(networkError);
        })(),
      );
      return;
    }
  }

  event.respondWith(fetch(request).catch(networkError));
});
