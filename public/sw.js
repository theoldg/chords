/**
 * Service worker: makes the app work with no signal, which is the point of
 * installing it on a phone in the first place — you practise where the wifi
 * isn't.
 *
 * Two strategies, chosen by what the request is:
 *
 *   - Navigations (the HTML): network first, cache as fallback. The HTML is the
 *     only file whose URL never changes, so serving it stale would pin you to
 *     an old build forever.
 *   - Everything else: cache first. Vite fingerprints asset filenames, so a
 *     cached hit is always the exact build that asked for it, and a new build
 *     simply asks for new names.
 */

/* Bumped when a precached file changes: the manifest has a stable URL and is
   served cache-first, so an installed copy keeps the old one until the cache
   name moves. */
const CACHE = "chord-shapes-v2";

self.addEventListener("install", (event) => {
  // Take over immediately rather than waiting for every tab to close.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["./", "./manifest.webmanifest"])),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never touch anything but same-origin GETs.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? (await caches.match("./"))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          // Only cache real, complete responses.
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
