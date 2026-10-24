"use client";

import { useState, type FormEvent } from "react";
import type { DecisionRow, FollowUp } from "@/lib/meeting";

type Person = { id: string; name: string; is_remote?: boolean };
const field = "min-h-12 w-full rounded-xl border border-line bg-raised px-3";
const short = (d: string) => new Date(`${d}T09:00:00Z`).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" });
const plusDays = (n: number) => new Date(Date.now() + 3 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);

/** Who's here: tap each person who came. Peter (away) counts when he's on a call. */
export function WhosHere({ people, here, onChange, big = false }: { people: Person[]; here: string[]; onChange: (ids: string[]) => void; big?: boolean }) {
  return (
    <div role="group" aria-label="Who's here" className="flex flex-wrap gap-2">
      {people.map((p) => {
        const on = here.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? here.filter((x) => x !== p.id) : [...here, p.id])}
            className={`rounded-xl border px-4 ${big ? "min-h-14 text-lg" : "min-h-11"} ${on ? "border-ink bg-ink text-raised" : "border-line bg-raised"}`}
          >
            {on ? "✓ " : ""}
            {p.name.split(" ")[0]}
            {p.is_remote ? <span className={on ? "opacity-80" : "text-muted"}> · on a call</span> : null}
          </button>
        );
      })}
    </div>
  );
}

const STATE = {
  late: { label: "Late", cls: "bg-out-bg text-out-fg" },
  open: { label: "Still to do", cls: "bg-low-bg text-low-fg" },
  done: { label: "Done", cls: "bg-ok-bg text-ok-fg" },
} as const;

/** "Last time we decided…": each decision with its owner, due date and whether it happened. */
export function FollowUps({ items, nameOf, onDone, big = false }: { items: FollowUp[]; nameOf: (id: string | null) => string; onDone: (d: DecisionRow) => void; big?: boolean }) {
  if (!items.length) return <p className="text-muted">Nothing left over from last time.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line">
      {items.map((d) => (
        <li key={d.id} className={`flex items-center justify-between gap-3 ${big ? "py-4" : "py-2"}`}>
          <span className="min-w-0">
            <span className={`block ${big ? "font-display text-2xl" : ""} ${d.state === "done" ? "line-through opacity-70" : ""}`}>{d.text}</span>
            <span className="text-sm text-muted">
              {d.owner_id ? nameOf(d.owner_id) : "Nobody named"}
              {d.due_on ? ` · by ${short(d.due_on)}` : ""}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${STATE[d.state].cls}`}>{STATE[d.state].label}</span>
            {d.state !== "done" && (
              <button type="button" onClick={() => onDone(d)} className="min-h-10 rounded-xl border border-line px-3 text-sm font-bold">
                ✓ Done
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A decision: what, who owns it, by when (a week by default). */
export function DecisionForm({ people, onSave }: { people: Person[]; onSave: (d: { text: string; owner_id: string | null; due_on: string | null }) => void }) {
  const [text, setText] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState(plusDays(7));
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    onSave({ text: text.trim(), owner_id: owner || null, due_on: due || null });
    setText("");
    setOwner("");
    setDue(plusDays(7));
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor="decision-new" className="sr-only">
        What did we decide?
      </label>
      <input id="decision-new" value={text} onChange={(e) => setText(e.target.value)} placeholder="What did we decide?" className={field} />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm font-bold">
          Who&apos;s doing it
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className={`${field} font-normal`}>
            <option value="">Nobody named</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          By when
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${field} font-normal`} />
        </label>
      </div>
      <button type="submit" disabled={!text.trim()} className="min-h-12 rounded-xl bg-brand font-bold text-brand-contrast disabled:opacity-50">
        Save the decision
      </button>
    </form>
  );
}
