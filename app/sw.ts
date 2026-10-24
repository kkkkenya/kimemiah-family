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

type Action = { action: string; title: string; url: string };
type Alert = { title?: string; body?: string; tag?: string; url?: string; type?: string; actions?: Action[]; badge?: number };
const STICKY = new Set(["urgent", "swap"]);
const BUZZ: Record<string, number[]> = { urgent: [300, 120, 300, 120, 300], due: [180, 100, 180], swap: [200, 100, 200], money: [150, 80, 150], bill: [150, 80, 150], question: [120, 80, 120], shop: [100, 60, 100] };

self.addEventListener("push", (event) => {
  let data: Alert = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  const type = data.type ?? "group";
  event.waitUntil(
    (async () => {
      // The number on the app icon: unread notifications.
      const nav = self.navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void> };
      if (typeof data.badge === "number") await nav.setAppBadge?.(data.badge).catch(() => undefined);
      // The app is open on screen: it shows its own banner, in this type's design.
      const open = (await self.clients.matchAll({ type: "window", includeUncontrolled: true })).filter((c) => (c as WindowClient).visibilityState === "visible");
      if (open.length) {
        for (const c of open) c.postMessage({ kind: "notice", notice: data });
        return;
      }
      await self.registration.showNotification(data.title ?? "Kimemiah Home", {
        body: data.body,
        tag: data.tag,
        icon: `/icons/n-${type}.png`,
        badge: `/icons/b-${type}.png`,
        vibrate: BUZZ[type] ?? [150],
        requireInteraction: STICKY.has(type),
        renotify: STICKY.has(type),
        timestamp: Date.now(),
        data: { url: data.url ?? "/", actions: data.actions ?? [] },
        // Buttons on the alert (Android; iPhone opens the app at the right place).
        actions: (data.actions ?? []).slice(0, 2).map((a) => ({ action: a.action, title: a.title })),
      } as NotificationOptions);
    })(),
  );
});

// Tapping an alert opens the app on the right tab (reusing an open window if there is one).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = (event.notification.data as { url?: string; actions?: Action[] } | undefined) ?? {};
  const url = (event.action && d.actions?.find((a) => a.action === event.action)?.url) || d.url || "/";
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
