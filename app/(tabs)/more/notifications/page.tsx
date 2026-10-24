"use client";

import { useEffect, useState } from "react";
import { PushCard } from "@/components/PushCard";
import { Screen } from "@/components/Screen";
import { useSync } from "@/components/SyncProvider";
import { Notice, type NoticeRow } from "@/components/notices/Notice";
import { NOTICE, type NoticeType } from "@/lib/push/style";
import { syncEngine } from "@/lib/sync/client";
import { useRows } from "@/lib/sync/hooks";

const dayOf = (iso?: string) => (iso ? new Date(Date.parse(iso) + 3 * 3600_000).toISOString().slice(0, 10) : "");

// Every notification sent to me, newest first, in each type's design. Opening the page marks
// them read (after a moment, so the unread ones can be seen first).
export default function NotificationsPage() {
  const { syncNow } = useSync();
  const rows = ((useRows<NoticeRow & { updated_at?: string }>("notifications") ?? []) as NoticeRow[]).filter((r) => !r.deleted_at).sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const [type, setType] = useState<NoticeType | "all" | "unread">("all");
  const unread = rows.filter((r) => !r.read_at);

  const unreadKey = unread.map((r) => r.id).join(",");
  useEffect(() => {
    if (!unreadKey) return;
    const t = window.setTimeout(async () => {
      const at = new Date().toISOString();
      for (const id of unreadKey.split(",")) await syncEngine().queue("notifications", "update", { id, read_at: at });
      void syncNow();
    }, 2500);
    return () => window.clearTimeout(t);
  }, [unreadKey, syncNow]);

  const types = [...new Set(rows.map((r) => r.type as NoticeType))].filter((t) => t in NOTICE);
  const shown = rows.filter((r) => (type === "all" ? true : type === "unread" ? !r.read_at : r.type === type)).slice(0, 100);
  const today = dayOf(new Date().toISOString());
  const groups = [
    { label: "Today", list: shown.filter((r) => dayOf(r.created_at) === today) },
    { label: "Earlier", list: shown.filter((r) => dayOf(r.created_at) !== today) },
  ].filter((g) => g.list.length);

  return (
    <Screen title="Notifications" back="/">
      <div className="flex flex-wrap gap-2 lg:[column-span:all]">
        {(["all", "unread", ...types] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={type === t}
            onClick={() => setType(t)}
            className={`min-h-10 rounded-md border px-3 text-sm font-bold ${type === t ? "border-ink bg-ink text-raised" : "border-line bg-raised"}`}
          >
            {t === "all" ? `All (${rows.length})` : t === "unread" ? `Unread (${unread.length})` : `${NOTICE[t].emoji} ${NOTICE[t].label}`}
          </button>
        ))}
      </div>

      {groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-2 lg:[column-span:all]">
          <h2 className="font-bold">{g.label}</h2>
          <ul className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:items-start">
            {g.list.map((n) => (
              <li key={n.id} className={n.read_at ? "opacity-80" : ""}>
                <Notice n={n} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      {!rows.length && <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-muted">Nothing yet. Notifications you get show up here, even on phones where alerts are off.</p>}

      <PushCard />
    </Screen>
  );
}
