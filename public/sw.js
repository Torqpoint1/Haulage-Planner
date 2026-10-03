/*
 * Offline support for the driver's run (spec 9.8: "works with a weak signal").
 *
 * - The run page (/driver) is network-first: with a signal the driver always
 *   sees the latest; without one, the last copy this phone loaded.
 * - Next's built files (/_next/static/…) never change once built, so they're
 *   served from the cache when present.
 * - Nothing else is touched. Deliveries themselves are queued in IndexedDB by
 *   the page and sent when there's a connection.
 *
 * Signing out sends "clear" so the next person on this phone can't see the run.
 */
const CACHE = "driver-run-v1";
const RUN_PATH = "/driver";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear") {
    event.waitUntil(caches.delete(CACHE));
    return;
  }
  // The page lists the files it loaded before this worker was in control, so
  // the very first visit already works offline afterwards.
  if (event.data?.type === "precache" && Array.isArray(event.data.urls)) {
    event.waitUntil(precache(event.data.urls));
  }
});

async function precache(urls) {
  const cache = await caches.open(CACHE);
  const statics = urls.filter((u) => {
    try {
      const url = new URL(u, self.location.origin);
      return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
    } catch {
      return false;
    }
  });
  await Promise.all(
    statics.map(async (u) => {
      if (await cache.match(u)) return;
      const response = await fetch(u).catch(() => null);
      if (response?.ok) await cache.put(u, response);
    }),
  );
  if (!(await cache.match(RUN_PATH))) {
    const response = await fetch(RUN_PATH, { credentials: "same-origin" }).catch(() => null);
    if (response?.ok && !response.redirected) await cache.put(RUN_PATH, response);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && url.pathname === RUN_PATH) {
    event.respondWith(runPage(request));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staticFile(request));
  }
});

async function runPage(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    // Only keep a real copy of the run, never a redirect to sign in.
    if (response.ok && !response.redirected) {
      await cache.put(RUN_PATH, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(RUN_PATH);
    return (
      cached ??
      new Response(
        "<!doctype html><meta name=viewport content='width=device-width'><title>No signal</title>" +
          "<p style='font-family:sans-serif;padding:16px'>No signal, and this phone hasn't loaded your run yet. " +
          "Try again when you have signal.</p>",
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
      )
    );
  }
}

async function staticFile(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}
