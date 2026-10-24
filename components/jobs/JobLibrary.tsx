"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { formatMinutes } from "@/lib/jobs/logic";
import { CATEGORIES, TEMPLATES, type Category, type Template } from "@/lib/jobs/templates";

const STRAIN: Record<string, string> = { light: "Light", medium: "Medium", heavy: "Heavy" };
const REPEAT: Record<string, string> = { daily: "daily", weekly: "weekly", biweekly: "every 2 weeks", monthly: "monthly", quarterly: "every 3 months" };

/** Every usual job, searchable and by kind. Picking one fills in the Add a job form. */
export function JobLibrary({ onPick, onClose, learned }: { onPick: (t: Template) => void; onClose: () => void; learned?: (key: string) => { minutes: number } | null }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Category | "all">("all");
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const label = (c: Category) => CATEGORIES.find((x) => x.id === c)?.label ?? c;
  const shown = TEMPLATES.filter((t) => (kind === "all" || t.category === kind) && words.every((w) => `${t.title} ${label(t.category)}`.toLowerCase().includes(w)));
  const groups = CATEGORIES.map((c) => ({ ...c, jobs: shown.filter((t) => t.category === c.id) })).filter((g) => g.jobs.length);

  return (
    <BottomSheet title="Job library" onClose={onClose}>
      <div className="flex flex-col gap-3 pb-2 lg:min-w-[40rem]">
        <div>
          <h2 className="font-display text-2xl">Job library</h2>
          <p className="text-sm text-muted">{TEMPLATES.length} usual jobs for the house. Pick one, then set the day and post it.</p>
        </div>
        <label className="sr-only" htmlFor="job-search">
          Search jobs
        </label>
        <input id="job-search" type="search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search: gutters, iron, dog…" className="min-h-12 w-full rounded-xl border border-line bg-raised px-4" />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
          {[{ id: "all" as const, label: "All" }, ...CATEGORIES].map((c) => (
            <button key={c.id} type="button" aria-pressed={kind === c.id} onClick={() => setKind(c.id)} className={`min-h-10 shrink-0 rounded-xl border px-3 text-sm ${kind === c.id ? "border-ink bg-ink text-raised" : "border-line bg-raised"}`}>
              {c.label}
            </button>
          ))}
        </div>
        {groups.map((g) => (
          <section key={g.id} aria-labelledby={`lib-${g.id}`}>
            <h3 id={`lib-${g.id}`} className="eyebrow mb-1">
              {g.label}
            </h3>
            <ul className="grid gap-2 lg:grid-cols-2">
              {g.jobs.map((t) => {
                const mins = learned?.(t.id)?.minutes ?? t.duration_min;
                return (
                  <li key={t.id}>
                    <button type="button" onClick={() => onPick(t)} className="flex min-h-14 w-full flex-col items-start rounded-xl border border-line bg-raised p-3 text-left hover:border-ink">
                      <span>{t.title}</span>
                      <span className="text-xs text-muted">
                        {formatMinutes(mins)} × {t.people_needed} {t.people_needed === 1 ? "person" : "people"} · {STRAIN[t.strain]}
                        {t.repeat ? ` · ${REPEAT[t.repeat]}` : ""}
                        {t.requires_funds ? " · needs money" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {!groups.length && <p className="rounded-xl border border-dashed border-line p-4 text-center text-muted">No usual job matches. Close this and write your own with + Add a job.</p>}
      </div>
    </BottomSheet>
  );
}
