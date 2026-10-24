"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSync } from "@/components/SyncProvider";
import { NOTICE, type NoticeType } from "@/lib/push/style";
import { syncEngine } from "@/lib/sync/client";
import { useRows } from "@/lib/sync/hooks";
import { Notice, type NoticeRow } from "./Notice";

const SEEN = "notices.bannered";

/**
 * While the app is open, a new notification drops in as a banner at the top, in its type's
 * design, instead of a phone alert. Urgent ones and swaps stay until dismissed; others go after
 * 8 seconds. Works without push too: it watches the inbox as it syncs.
 */
export function NoticeBanner() {
  const { syncNow } = useSync();
  const path = usePathname();
  const raw = useRows<NoticeRow & { updated_at?: string }>("notifications");
  const rows = useMemo(() => (raw ?? []) as NoticeRow[], [raw]);
  const [shown, setShown] = useState<NoticeRow | null>(null);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      seen.current = new Set(JSON.parse(sessionStorage.getItem(SEEN) ?? "[]"));
    } catch {}
    // A push arrived while the app is on screen: fetch it now so it shows straight away.
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { kind?: string })?.kind === "notice") void syncNow();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, [syncNow]);

  useEffect(() => {
    if (shown || path === "/more/notifications") return;
    const fresh = rows
      .filter((r) => !r.read_at && !r.deleted_at && r.created_at && Date.now() - Date.parse(r.created_at) < 5 * 60_000 && !seen.current.has(r.id))
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    if (!fresh.length) return;
    for (const r of fresh) seen.current.add(r.id);
    try {
      sessionStorage.setItem(SEEN, JSON.stringify([...seen.current]));
    } catch {}
    // Several at once: one banner that opens the inbox, not a queue of them.
    setShown(fresh.length === 1 ? fresh[0] : { id: "group", type: "group", title: `${fresh.length} new notifications`, body: fresh.slice(0, 3).map((r) => r.title).join(" · "), url: "/more/notifications", created_at: fresh[0].created_at });
  }, [rows, shown, path]);

  useEffect(() => {
    if (!shown || NOTICE[shown.type as NoticeType]?.sticky) return;
    const t = window.setTimeout(() => setShown(null), 8000);
    return () => window.clearTimeout(t);
  }, [shown]);

  if (!shown) return null;
  const read = () => {
    if (shown.id !== "group") void syncEngine().queue("notifications", "update", { id: shown.id, read_at: new Date().toISOString() }).then(() => syncNow());
  };
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-50 px-3 lg:left-auto lg:right-4 lg:w-[26rem]">
      <div className="notice-in mx-auto max-w-xl">
        <Notice
          n={shown}
          floating
          onOpen={() => {
            read();
            setShown(null);
          }}
          onClose={() => setShown(null)}
        />
      </div>
    </div>
  );
}
