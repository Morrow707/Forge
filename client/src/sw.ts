/// <reference lib="webworker" />
import { precacheAndRoute, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";

declare let self: ServiceWorkerGlobalScope;

// Required boilerplate for VitePWA's injectManifest strategy -- this is
// where the build-time-generated precache manifest gets wired up. Without
// this the app shell (JS/CSS/HTML) wouldn't work offline anymore, which is
// the whole reason a service worker exists here in the first place.
precacheAndRoute(self.__WB_MANIFEST);

// SPA navigation fallback (serve the cached app shell for any offline
// deep link) -- excluding API routes so a request for JSON never gets
// index.html back. API responses are never precached/served from here at
// all; they go through the app's own localStorage-backed offline
// cache/queue on the workout page instead, so live data is never served
// stale by this worker.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//],
  }),
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
