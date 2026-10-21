"use client";

import { useState } from "react";
import { useSync } from "@/components/SyncProvider";
import { leaveJob } from "@/lib/jobs/actions";
import { workers, type Job, type Participant } from "@/lib/jobs/logic";
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
  const { online, syncNow } = useSync();
  const me = useMe() as WithPresence | undefined;
  const members = (useRows<WithPresence>("members") ?? []).filter((m) => m.active !== false).sort((a, b) => a.sort - b.sort);
  const jobs = (useRows<Job & { id: string }>("jobs") ?? []) as Job[];
  const parts = (useRows<Participant & { id: string }>("job_participants") ?? []) as Participant[];
  const [handover, setHandover] = useState<Job[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  if (!me) return null;
  const mine = me.presence ?? "at_home";
  const myJobs = jobs.filter((j) => !j.done_at && !j.deleted_at && workers(j.id, parts).some((p) => p.member_id === me.id));
  const home = members.filter((m) => m.id !== me.id && (m.presence ?? "at_home") === "at_home").map((m) => m.name);

  async function set(p: Presence) {
    if (!me || p === mine) return;
    await syncEngine().queue("members", "update", { id: me.id, presence: p });
    void syncNow();
    setNote(null);
    // Leaving the house with jobs on: offer them to whoever is still at home.
    setHandover(p !== "at_home" && myJobs.length ? myJobs : null);
  }

  async function handOver() {
    if (!handover) return;
    const errors = (await Promise.all(handover.map((j) => leaveJob(j.id)))).filter(Boolean);
    void syncNow();
    setHandover(null);
    setNote(errors.length ? errors[0] : "Back on the board for whoever's at home.");
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
      {handover && (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-line p-3">
          <p>
            You&apos;re on {handover.map((j) => j.title).join(", ")}. Hand {handover.length === 1 ? "it" : "them"} to someone at home
            {home.length ? ` (${home.join(", ")})` : ""}?
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={!online} onClick={handOver} className="min-h-12 rounded-xl bg-brand px-4 font-bold text-brand-contrast disabled:opacity-50">
              {online ? "Hand over" : "Needs signal"}
            </button>
            <button type="button" onClick={() => setHandover(null)} className="min-h-12 rounded-xl px-4 font-bold text-brand">
              I&apos;ll still do {handover.length === 1 ? "it" : "them"}
            </button>
          </div>
        </div>
      )}
      {note && <p className="mt-2 text-sm text-muted">{note}</p>}
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
