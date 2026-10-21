"use client";

import { useSync } from "@/components/SyncProvider";
import { syncEngine } from "@/lib/sync/client";
import { useMe, useRows, type Member } from "@/lib/sync/hooks";

export type Presence = "at_home" | "out" | "away";
type WithPresence = Member & { presence?: Presence };

export const PRESENCE: Record<Presence, { icon: string; word: string; long: string }> = {
  at_home: { icon: "🏠", word: "At home", long: "At home" },
  out: { icon: "🚶", word: "Out", long: "Out (errands, school)" },
  away: { icon: "🧳", word: "Away", long: "Away from home" },
};

// Where everyone is right now. Each person sets their own; it helps pick who can do a job.
export function PresenceCard() {
  const { syncNow } = useSync();
  const me = useMe() as WithPresence | undefined;
  const members = (useRows<WithPresence>("members") ?? []).filter((m) => m.active !== false).sort((a, b) => a.sort - b.sort);
  if (!me) return null;
  const mine = me.presence ?? "at_home";

  async function set(p: Presence) {
    if (!me || p === mine) return;
    await syncEngine().queue("members", "update", { id: me.id, presence: p });
    void syncNow();
  }

  return (
    <section aria-labelledby="where" className="rounded-xl bg-raised p-4 shadow-[0_1px_3px_rgba(10,51,35,.10)]">
      <h2 id="where" className="font-bold">
        Where are you?
      </h2>
      <div role="radiogroup" aria-labelledby="where" className="mt-2 grid grid-cols-3 gap-2">
        {(Object.keys(PRESENCE) as Presence[]).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={mine === p}
            onClick={() => set(p)}
            className={`min-h-14 rounded-xl border px-2 text-sm font-bold leading-tight ${mine === p ? "border-brand bg-brand text-brand-contrast" : "border-line"}`}
          >
            <span aria-hidden="true">{PRESENCE[p].icon} </span>
            {PRESENCE[p].long}
          </button>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-2 text-sm">
        {members
          .filter((m) => m.id !== me.id)
          .map((m) => {
            const p = PRESENCE[m.presence ?? "at_home"];
            return (
              <li key={m.id} className="rounded-full border border-line px-3 py-1">
                <span aria-hidden="true">{p.icon} </span>
                {m.name}: {p.word.toLowerCase()}
              </li>
            );
          })}
      </ul>
    </section>
  );
}
