"use client";

import Link from "next/link";
import { NOTICE, type NoticeAction, type NoticeType } from "@/lib/push/style";

export type NoticeRow = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  url?: string | null;
  actions?: NoticeAction[] | null;
  read_at?: string | null;
  created_at?: string;
  deleted_at?: string | null;
};

const ago = (iso?: string) => {
  if (!iso) return "";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" });
};

/**
 * One notification in its type's design: a coloured stripe and round icon, the label, title,
 * body and its buttons. Used by the in-app banner and the inbox.
 */
export function Notice({ n, onOpen, onClose, floating = false }: { n: NoticeRow; onOpen?: () => void; onClose?: () => void; floating?: boolean }) {
  const style = NOTICE[(n.type as NoticeType) in NOTICE ? (n.type as NoticeType) : "group"];
  const unread = !n.read_at;
  return (
    <div
      className={`relative flex gap-3 overflow-hidden rounded-2xl border border-line bg-raised p-4 pl-5 ${floating ? "shadow-[0_10px_15px_-3px_rgba(34,32,29,0.18),0_4px_6px_-4px_rgba(34,32,29,0.12)]" : ""}`}
      style={{ ["--n" as string]: style.color }}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-[var(--n)]" />
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--n)] text-lg text-white">
        {style.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-xs">
          <span className="font-bold uppercase tracking-wider text-[var(--n)]">{style.label}</span>
          <span className="text-muted">{ago(n.created_at)}</span>
          {unread && !floating && <span className="size-2 rounded-full bg-[var(--n)]" aria-label="Unread" />}
        </p>
        <Link href={n.url || "/"} onClick={onOpen} className="block">
          <p className="font-bold leading-snug">{n.title}</p>
          {n.body && <p className="text-sm text-muted">{n.body}</p>}
        </Link>
        {(n.actions?.length ?? 0) > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {n.actions!.map((a, i) => (
              <Link
                key={a.action}
                href={a.url}
                onClick={onOpen}
                className={`flex min-h-10 items-center rounded-xl px-4 text-sm font-bold ${i === 0 ? "bg-[var(--n)] text-white" : "border border-line"}`}
              >
                {a.title}
              </Link>
            ))}
          </div>
        )}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss" className="-mr-2 -mt-2 flex size-10 shrink-0 items-center justify-center text-muted">
          ✕
        </button>
      )}
    </div>
  );
}
