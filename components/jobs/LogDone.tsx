"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { formatMinutes } from "@/lib/jobs/logic";
import { CATEGORIES, TEMPLATES, type Category, type Template } from "@/lib/jobs/templates";
import { supabase } from "@/lib/supabase/client";

type Person = { id: string; name: string };
type Strain = "light" | "medium" | "heavy";
const STRAINS: { id: Strain; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "medium", label: "Medium" },
  { id: "heavy", label: "Heavy" },
];
const field = "min-h-12 w-full rounded-xl border border-line bg-raised px-3 font-normal";
const nairobi = (ms: number) => new Date(ms + 3 * 3600_000).toISOString();

// A job already done, logged afterwards (nobody posted it first): what it was, when, how long,
// and who did how much. It goes on the board as done and counts toward everyone's time given.
export function LogDone({ meId, people, onDone, onClose }: { meId?: string; people: Person[]; onDone: (msg: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState<Template | null>(null);
  const [category, setCategory] = useState<Category>("compound_garden");
  const [strain, setStrain] = useState<Strain>("medium");
  const [minutes, setMinutes] = useState(60);
  const now = nairobi(Date.now());
  const [day, setDay] = useState(now.slice(0, 10));
  const [time, setTime] = useState(now.slice(11, 16));
  const [shares, setShares] = useState<Record<string, number>>(meId ? { [meId]: 100 } : {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = words.length ? TEMPLATES.filter((t) => words.every((w) => t.title.toLowerCase().includes(w))).slice(0, 5) : [];
  const total = Object.values(shares).reduce((s, n) => s + n, 0);
  const who = Object.keys(shares);

  function pick(t: Template) {
    setTemplate(t);
    setTitle(t.title);
    setCategory(t.category);
    setStrain(t.strain);
    setMinutes(t.duration_min);
    setQuery("");
  }

  // Tapping a person adds them with what's left (or splits evenly); tapping again takes them off.
  function toggle(id: string) {
    setShares((s) => {
      const next = { ...s };
      if (id in next) delete next[id];
      else next[id] = 0;
      const ids = Object.keys(next);
      const even = Math.floor(100 / ids.length / 5) * 5;
      ids.forEach((k, i) => (next[k] = i === 0 ? 100 - even * (ids.length - 1) : even));
      return next;
    });
  }
  // Moving one person's share gives the difference to (or takes it from) the first other person.
  function setShare(id: string, pct: number) {
    setShares((s) => {
      const other = Object.keys(s).find((k) => k !== id);
      if (!other) return { [id]: 100 };
      const v = Math.max(5, Math.min(100 - 5 * (Object.keys(s).length - 1), pct));
      const rest = 100 - v - Object.entries(s).filter(([k]) => k !== id && k !== other).reduce((a, [, n]) => a + n, 0);
      return { ...s, [id]: v, [other]: Math.max(5, rest) };
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    const doneAt = new Date(`${day}T${time}:00+03:00`).toISOString();
    const { error: e } = await supabase().rpc("log_done_job", {
      p_title: title.trim(),
      p_category: category,
      p_strain: strain,
      p_duration: minutes,
      p_done_at: doneAt,
      p_shares: who.map((id) => ({ member_id: id, pct: shares[id] })),
      p_template: template?.id ?? null,
    });
    setBusy(false);
    if (e) return setError(e.message.includes("Failed to fetch") ? "That needs signal. Try again when you're connected." : e.message);
    const names = who.map((id) => `${people.find((p) => p.id === id)?.name.split(" ")[0] ?? "Someone"} ${shares[id]}%`).join(", ");
    onDone(`${title.trim()}: logged as done (${names}). Asante!`);
  }

  const ok = title.trim() && total === 100 && who.length > 0 && minutes >= 5;

  return (
    <BottomSheet title="Log a job already done" onClose={onClose}>
      <div className="flex flex-col gap-4 pb-2">
        <div>
          <h2 className="font-display text-2xl">Log a job already done</h2>
          <p className="text-sm text-muted">For work nobody posted first. It counts like any other job.</p>
        </div>

        <label className="flex flex-col gap-1 text-sm font-bold">
          What was done
          <input
            value={template ? title : query || title}
            onChange={(e) => {
              setTemplate(null);
              setTitle(e.target.value);
              setQuery(e.target.value);
            }}
            placeholder="e.g. Clear the drive"
            className={field}
          />
        </label>
        {matches.length > 0 && (
          <ul className="-mt-2 flex flex-col divide-y divide-line rounded-xl border border-line bg-raised">
            {matches.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => pick(t)} className="min-h-11 w-full px-3 py-2 text-left text-sm">
                  {t.title} <span className="text-muted">· {formatMinutes(t.duration_min)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm font-bold">
            Day
            <input type="date" value={day} max={now.slice(0, 10)} onChange={(e) => setDay(e.target.value || now.slice(0, 10))} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold">
            Finished at
            <input type="time" value={time} onChange={(e) => setTime(e.target.value || "12:00")} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold">
            How long (minutes)
            <input type="number" inputMode="numeric" min={5} max={1440} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 0)} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold">
            Kind
            <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={field}>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div role="radiogroup" aria-label="How hard" className="grid grid-cols-3 gap-2">
          {STRAINS.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={strain === s.id} onClick={() => setStrain(s.id)} className={`min-h-11 rounded-xl border text-sm font-bold ${strain === s.id ? "border-ink bg-ink text-raised" : "border-line"}`}>
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold">Who did it, and how much each</p>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => (
              <button key={p.id} type="button" aria-pressed={p.id in shares} onClick={() => toggle(p.id)} className={`min-h-10 rounded-full border px-4 text-sm font-bold ${p.id in shares ? "border-ink bg-ink text-raised" : "border-line bg-raised"}`}>
                {p.name.split(" ")[0]}
              </button>
            ))}
          </div>
          {who.length > 1 &&
            who.map((id) => (
              <label key={id} className="flex items-center gap-3 text-sm">
                <span className="w-20 shrink-0 font-bold">{people.find((p) => p.id === id)?.name.split(" ")[0]}</span>
                <input type="range" min={5} max={95} step={5} value={shares[id]} onChange={(e) => setShare(id, Number(e.target.value))} className="flex-1" aria-label={`Share for ${people.find((p) => p.id === id)?.name}`} />
                <span className="w-16 shrink-0 text-right tabular">
                  {shares[id]}% · {formatMinutes(Math.round((minutes * shares[id]) / 100))}
                </span>
              </label>
            ))}
          {who.length > 0 && total !== 100 && <p className="text-sm text-out-fg">The shares add up to {total}%. Make them 100%.</p>}
        </div>

        {error && <p className="text-sm text-out-fg">{error}</p>}
        <button type="button" disabled={!ok || busy} onClick={() => void save()} className="min-h-12 rounded-xl bg-brand font-bold text-brand-contrast disabled:opacity-40">
          {busy ? "Saving…" : "✓ Log it as done"}
        </button>
      </div>
    </BottomSheet>
  );
}
