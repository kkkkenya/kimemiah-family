"use client";

import { useEffect, useState, type FormEvent } from "react";
import { dayPlus, dueOnDay, endOfToday, type NewJob } from "@/lib/jobs/actions";
import { formatMinutes, jobSize, type Strain } from "@/lib/jobs/logic";
import { CATEGORIES, TEMPLATES } from "@/lib/jobs/templates";
import { STRAIN } from "./JobCard";
import { JobLibrary } from "./JobLibrary";

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];
const REPEATS = [
  { value: "none", label: "Just once" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Every month" },
  { value: "quarterly", label: "Every 3 months" },
];
type When = "today" | "tomorrow" | "date";

const field = "min-h-12 w-full rounded-xl border border-line bg-base px-3";
const pill = (on: boolean) => `min-h-12 rounded-xl border px-3 text-sm font-bold ${on ? "border-brand bg-brand text-brand-contrast" : "border-line"}`;

// Anyone can post a job. How long it takes and how many people it needs set its size;
// Light / Medium / Heavy says how physically hard it is.
type Learned = (key: string) => { minutes: number; samples: number } | null;

export function JobForm({ onPost, onCancel, learned, start }: { onPost: (job: NewJob) => void; onCancel: () => void; learned?: Learned; start?: string }) {
  const [library, setLibrary] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("house_cleaning");
  const [duration, setDuration] = useState(30);
  const [people, setPeople] = useState(1);
  const [strain, setStrain] = useState<Strain>("medium");
  const [when, setWhen] = useState<When>("today");
  const [date, setDate] = useState(dayPlus(3));
  const [repeat, setRepeat] = useState("none");
  const [funds, setFunds] = useState(false);
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const real = templateKey ? learned?.(templateKey) : null;

  const size = jobSize({ duration_min: duration, people_needed: people });

  function applyTemplate(id: string) {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setTitle(t.title);
    setTemplateKey(t.id);
    setCategory(t.category);
    setDuration(learned?.(t.id)?.minutes ?? t.duration_min);
    setPeople(t.people_needed);
    setStrain(t.strain);
    setRepeat(t.repeat ?? "none");
    setFunds(!!t.requires_funds);
    if (t.requires_funds) {
      setWhen("date");
      setDate(dayPlus(t.daysAhead ?? 3));
    }
  }

  // Opened from the job library: start from that job.
  useEffect(() => {
    if (start) applyTemplate(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the job it was opened with
  }, []);

  function toggleFunds(on: boolean) {
    setFunds(on);
    // Money jobs: two people go, planned 2-4 days ahead so the money can be arranged.
    if (on) {
      setPeople((p) => Math.max(2, p));
      setWhen("date");
      setDate(dayPlus(3));
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const day = when === "today" ? null : when === "tomorrow" ? dayPlus(1) : date;
    const amount = Number(cost.replace(/[, ]/g, ""));
    onPost({
      title,
      notes,
      category,
      strain,
      duration_min: duration,
      people_needed: people,
      due_at: day ? dueOnDay(day) : endOfToday(),
      repeat,
      requires_funds: funds,
      estimated_cost_kes: funds && amount > 0 ? amount : null,
      planned_for: funds ? (day ?? dayPlus(0)) : null,
      template_key: templateKey,
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border-2 border-brand bg-raised p-4">
      <h2 className="font-display text-xl">Add a job</h2>

      <button type="button" onClick={() => setLibrary(true)} className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-line bg-base px-4 text-left">
        <span>{templateKey ? "Picked from the job library" : "Start from a usual job"}</span>
        <span className="text-sm text-muted">{TEMPLATES.length} jobs ›</span>
      </button>
      {library && (
        <JobLibrary
          learned={learned}
          onClose={() => setLibrary(false)}
          onPick={(t) => {
            applyTemplate(t.id);
            setLibrary(false);
          }}
        />
      )}

      <label className="flex flex-col gap-1 text-sm font-bold">
        What needs doing?
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Clean the store room" className={field} />
      </label>

      <label className="flex flex-col gap-1 text-sm font-bold">
        Kind of job
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-bold">How long does it take?</legend>
        {real && (
          <p className="text-sm text-ok-fg">
            Usually takes {formatMinutes(real.minutes)} (the last {real.samples} times)
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {[...new Set([...DURATIONS, duration])].sort((x, y) => x - y).map((d) => (
            <button key={d} type="button" aria-pressed={duration === d} onClick={() => setDuration(d)} className={pill(duration === d)}>
              {formatMinutes(d)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex items-center justify-between gap-2">
        <legend className="text-sm font-bold">How many people?</legend>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="One fewer person" disabled={people <= 1} onClick={() => setPeople(people - 1)} className="flex size-12 items-center justify-center rounded-xl border border-line bg-base text-xl font-bold disabled:opacity-40">
            −
          </button>
          <span className="min-w-16 text-center font-bold tabular" aria-live="polite">
            {people === 1 ? "1 person" : `${people} people`}
          </span>
          <button type="button" aria-label="One more person" disabled={people >= 4} onClick={() => setPeople(people + 1)} className="flex size-12 items-center justify-center rounded-xl border border-line bg-base text-xl font-bold disabled:opacity-40">
            +
          </button>
        </div>
      </fieldset>

      <p className="rounded-lg bg-base px-3 py-2 text-sm tabular" aria-live="polite">
        Size: <strong>{size.label} job</strong> · {formatMinutes(duration)} × {people === 1 ? "1 person" : `${people} people`} = {formatMinutes(size.personMinutes)} of work
      </p>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-bold">How physically hard?</legend>
        <div role="radiogroup" aria-label="How physically hard" className="grid grid-cols-3 gap-2">
          {(["light", "medium", "heavy"] as Strain[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={strain === s} onClick={() => setStrain(s)} className={pill(strain === s)}>
              {STRAIN[s].icon} {STRAIN[s].word}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="flex min-h-12 items-center gap-3">
        <input type="checkbox" checked={funds} onChange={(e) => toggleFunds(e.target.checked)} className="size-6" />
        Needs money (2 people go, planned 2–4 days ahead)
      </label>
      {funds && (
        <label className="flex flex-col gap-1 text-sm font-bold">
          About how much (KES)
          <input inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Optional" className={field} />
        </label>
      )}

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-bold">When</legend>
        <div className="grid grid-cols-3 gap-2">
          {(["today", "tomorrow", "date"] as When[]).map((w) => (
            <button key={w} type="button" aria-pressed={when === w} onClick={() => setWhen(w)} className={pill(when === w)}>
              {w === "today" ? "Today" : w === "tomorrow" ? "Tomorrow" : "Pick a day"}
            </button>
          ))}
        </div>
        {when === "date" && <input type="date" aria-label="Day" value={date} min={dayPlus(0)} onChange={(e) => setDate(e.target.value)} className={field} />}
      </fieldset>

      <label className="flex flex-col gap-1 text-sm font-bold">
        Repeat
        <select value={repeat} onChange={(e) => setRepeat(e.target.value)} className={field}>
          {REPEATS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm font-bold">
        Notes (optional)
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. account number for the water bill" className={field} />
      </label>

      <div className="flex gap-2">
        <button type="submit" disabled={!title.trim()} className="min-h-12 flex-1 rounded-xl bg-brand font-bold text-brand-contrast disabled:opacity-50">
          Post job
        </button>
        <button type="button" onClick={onCancel} className="min-h-12 rounded-xl px-4 font-bold text-brand">
          Cancel
        </button>
      </div>
    </form>
  );
}
