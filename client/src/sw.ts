/// <reference lib="webworker" />
import { precacheAndRoute, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { StaleWhileRevalidate } from "workbox-strategies";
import { answerNavigation } from "./sw-shell";

declare let self: ServiceWorkerGlobalScope;

// Required boilerplate for VitePWA's injectManifest strategy -- this is
// where the build-time-generated precache manifest gets wired up. Without
// this the app shell (JS/CSS/HTML) wouldn't work offline anymore, which is
// the whole reason a service worker exists here in the first place.
precacheAndRoute(self.__WB_MANIFEST);

// The MediaPipe pose-tracking WASM runtime is excluded from the precache
// manifest above (see vite.config.ts -- each file is ~11-12MB, too big to
// precache at install time for a feature most sessions never touch).
// Runtime-cached here instead: stale-while-revalidate serves the cached
// copy instantly on every tracked set after the first, while still
// fetching a fresh one in the background so an upgraded WASM build isn't
// stuck being served forever the way a plain cache-first would.
registerRoute(
  ({ url }) => url.pathname.startsWith("/mediapipe-wasm/"),
  new StaleWhileRevalidate({ cacheName: "mediapipe-wasm" }),
);

// Same reasoning and treatment as mediapipe-wasm above, for
// implement-detection.ts's own ONNX runtime (see vite.config.ts's matching
// globIgnores entry) -- excluded from the precache manifest (too large,
// only touched by the object-detection corroboration signal, not every
// session), runtime-cached here instead.
registerRoute(
  ({ url }) => url.pathname.startsWith("/onnxruntime-wasm/"),
  new StaleWhileRevalidate({ cacheName: "onnxruntime-wasm" }),
);

// Every navigation -- an emailed link, a typed address, a reload -- is answered by the LIVE
// shell from the server first, and by the precached shell only when the network cannot
// answer (offline, a timeout, or the 502 a deploy serves for half a minute). It used to be the
// precached shell always, which meant that for the window between a deploy and this worker's
// background update, a route added in that deploy rendered the 404 page: the stale shell names
// a stale bundle, and the stale bundle carries the router. See sw-shell.ts for the take that
// found it. API routes are excluded so a request for JSON never gets index.html back; API
// responses are never precached or served from here at all (the workout page's own
// localStorage-backed offline cache/queue handles those), so live data is never served stale
// by this worker.
const precachedShell = createHandlerBoundToURL("/index.html");
registerRoute(
  new NavigationRoute(
    (params) =>
      answerNavigation({
        fetchLive: () => fetch(params.request),
        precachedShell: () => precachedShell(params),
      }),
    { denylist: [/^\/api\//] },
  ),
);

self.skipWaiting();
self.addEventListener("activate", () => self.clients.claim());

type PushPayload = { title: string; body: string; url?: string };

self.addEventListener("push", (event) => {
  let payload: PushPayload = { title: "Forge", body: "" };
  try {
    if (event.data) payload = event.data.json();
  } catch {
    // ignore malformed payloads rather than crashing the worker
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client && new URL(client.url).pathname === url) {
          return (client as WindowClient).focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
