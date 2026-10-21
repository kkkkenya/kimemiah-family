"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { localDB } from "@/lib/sync/client";
import { useSync } from "./SyncProvider";

// A small dot in the header: green when everything is synced, amber with a count while changes
// wait on the phone (no error pop-ups; they sync when signal returns).
export function SyncDot() {
  const { online } = useSync();
  const pending = useLiveQuery(() => localDB().outbox.where("status").equals("pending").count(), [], 0);
  const synced = online && pending === 0;
  const label = synced ? "Live and synced" : `Saved on this phone${pending ? ` (${pending})` : ""} · syncs when there's signal`;
  return (
    <span role="status" title={label} className="flex size-12 shrink-0 items-center justify-center">
      <span aria-hidden="true" className={`size-3 rounded-full ${synced ? "bg-ok-fg" : "bg-low-fg"}`} />
      {!synced && pending > 0 && <span aria-hidden="true" className="ml-1 text-xs font-bold tabular text-low-fg">{pending}</span>}
      <span className="sr-only">{label}</span>
    </span>
  );
}
