/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Never cache data: Supabase and our own API always go to the network.
    // The app keeps its data in IndexedDB instead.
    { matcher: ({ url, sameOrigin }) => !sameOrigin || url.pathname.startsWith("/api/"), handler: new NetworkOnly() },
    ...defaultCache,
  ],
});

serwist.addEventListeners();

// ---------------------------------------------------------------- push alerts

type Alert = { title?: string; body?: string; tag?: string; url?: string };

self.addEventListener("push", (event) => {
  let data: Alert = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Kimemiah Home", {
      body: data.body,
      tag: data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url ?? "/" },
    }),
  );
});

// Tapping an alert opens the app on the right tab (reusing an open window if there is one).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const open = windows[0];
      if (open) {
        await open.navigate(url).catch(() => undefined);
        return open.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
