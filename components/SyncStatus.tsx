"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { localDB } from "@/lib/sync/client";
import { useSync } from "./SyncProvider";

// Small strip under the header: offline banner and changes still waiting to sync.
export function SyncStatus() {
  const { online } = useSync();
  const pending = useLiveQuery(() => localDB().outbox.where("status").equals("pending").count(), [], 0);
  const rejected = useLiveQuery(() => localDB().outbox.where("status").equals("rejected").count(), [], 0);

  if (online && pending === 0 && rejected === 0) return null;

  return (
    <div className="flex flex-col gap-1 px-4 py-2 text-sm" role="status">
      {!online && (
        <p className="rounded-xl bg-low-bg px-3 py-2 text-low-fg">
          No connection. You can keep updating; we&apos;ll sync when you&apos;re back.
        </p>
      )}
      {pending > 0 && (
        <p className="text-muted">
          {pending === 1 ? "1 change not synced yet" : `${pending} changes not synced yet`}
        </p>
      )}
      {rejected > 0 && (
        <p className="text-out-strong">
          {rejected === 1 ? "1 change wasn't saved." : `${rejected} changes weren't saved.`} See Settings (top right).
        </p>
      )}
    </div>
  );
}
