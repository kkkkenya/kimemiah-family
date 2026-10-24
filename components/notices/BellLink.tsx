"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRows } from "@/lib/sync/hooks";

/** The bell in the header, with how many notifications are unread. Also sets the app-icon number. */
export function BellLink() {
  const rows = (useRows<{ id: string; read_at?: string | null; deleted_at?: string | null }>("notifications") ?? []) as { read_at?: string | null; deleted_at?: string | null }[];
  const unread = rows.filter((r) => !r.read_at && !r.deleted_at).length;

  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (unread) void nav.setAppBadge?.(unread).catch(() => undefined);
    else void nav.clearAppBadge?.().catch(() => undefined);
  }, [unread]);

  return (
    <Link href="/more/notifications" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} title="Notifications" className="relative flex size-10 items-center justify-center rounded-md text-brand hover:bg-base lg:size-12">
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5Z" />
        <path d="M10 20.5a2 2 0 0 0 4 0" />
      </svg>
      {unread > 0 && (
        <span className="absolute -right-0.5 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#E8590C] px-1 text-[0.7rem] font-bold leading-none text-white tabular" aria-hidden="true">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
