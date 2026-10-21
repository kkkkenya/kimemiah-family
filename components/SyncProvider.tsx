"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { SyncResult } from "@/lib/sync/engine";
import { readIdentity, syncEngine, wipePhone } from "@/lib/sync/client";

type SyncContext = {
  online: boolean;
  syncing: boolean;
  syncNow: () => Promise<SyncResult | undefined>;
};

const Ctx = createContext<SyncContext>({ online: true, syncing: false, syncNow: async () => undefined });

export const useSync = () => useContext(Ctx);

const EVERY_MS = 30_000;

// Keeps the phone in step with the server: on open, when signal returns,
// when the app comes to the front, and every 30 seconds while it's on screen.
// Also sends people to unlock / "Who are you?" when needed.
export function SyncProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const busy = useRef(false);

  const syncNow = useCallback(async () => {
    if (busy.current) return undefined;
    busy.current = true;
    setSyncing(true);
    try {
      const result = await syncEngine().syncNow();
      if (!result.ok && result.reason === "not_unlocked") {
        await wipePhone({ remote: true });
        router.replace("/unlock");
      }
      return result;
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    readIdentity().then((id) => {
      if (cancelled) return;
      if (!id.deviceId) router.replace("/unlock");
      else if (!id.memberId) router.replace("/who");
      else setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    setOnline(navigator.onLine);
    syncNow();

    const onOnline = () => {
      setOnline(true);
      syncNow();
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") syncNow();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") syncNow();
    }, EVERY_MS);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [ready, syncNow]);

  if (!ready) return null;
  return <Ctx.Provider value={{ online, syncing, syncNow }}>{children}</Ctx.Provider>;
}
