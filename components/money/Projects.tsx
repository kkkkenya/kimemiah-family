"use client";

import { useState, type FormEvent } from "react";
import { kes } from "@/lib/shopping/pricing";
import { projectProgress, type Entry, type Project } from "@/lib/money/money";

const field = "min-h-12 w-full rounded-xl border border-line bg-base px-3";

// Things the family saves up for: house work (painting, repairs) and quality-of-life upgrades.
// Money given to a project is set aside; when it reaches the target, its job unlocks.
export function Projects({
  projects,
  entries,
  onNew,
  onGive,
  onSpend,
  onDone,
}: {
  projects: Project[];
  entries: Entry[];
  onNew: (p: { title: string; kind: Project["kind"]; target_kes: number; notes: string; postJob: boolean }) => void;
  onGive: (p: Project) => void;
  onSpend: (p: Project) => void;
  onDone: (p: Project) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Project["kind"]>("house_work");
  const [target, setTarget] = useState("");
  const [notes, setNotes] = useState("");
  const [postJob, setPostJob] = useState(true);
  const live = projects.filter((p) => !p.deleted_at).sort((a, b) => (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0));
  const value = Number(target.replace(/[, ]/g, ""));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !(value > 0)) return;
    onNew({ title: title.trim(), kind, target_kes: value, notes: notes.trim(), postJob: kind === "house_work" && postJob });
    setAdding(false);
    setTitle("");
    setTarget("");
    setNotes("");
  }

  return (
    <section aria-labelledby="projects" className="rounded-xl bg-raised p-4 shadow-[0_1px_3px_rgba(10,51,35,.10)]">
      <div className="flex items-center justify-between gap-2">
        <h2 id="projects" className="font-display text-xl">
          Projects
        </h2>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="min-h-12 rounded-xl border border-brand px-3 font-bold text-brand">
            + New project
          </button>
        )}
      </div>
      <p className="text-sm text-muted">Save up for house work and upgrades. Money given here is set aside, not shopping money.</p>

      {adding && (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2 rounded-xl border border-line p-3">
          <div role="radiogroup" aria-label="Kind of project" className="grid grid-cols-2 gap-2">
            {(
              [
                ["house_work", "🔨 House work"],
                ["upgrade", "✨ Upgrade"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`min-h-12 rounded-xl border font-bold ${kind === k ? "border-brand bg-brand text-brand-contrast" : "border-line"}`}>
                {label}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-sm font-bold">
            What is it?
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "house_work" ? "e.g. Repaint the gate" : "e.g. New mop, bucket and basin"} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold">
            Target (KES)
            <input inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} className={`${field} tabular`} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold">
            Notes
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional: what's needed, where to buy" className={field} />
          </label>
          {kind === "house_work" && (
            <label className="flex min-h-12 items-center gap-3 text-sm">
              <input type="checkbox" checked={postJob} onChange={(e) => setPostJob(e.target.checked)} className="size-6" />
              Also post it on Jobs (it unlocks once the money is there)
            </label>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={!title.trim() || !(value > 0)} className="min-h-12 flex-1 rounded-xl bg-brand font-bold text-brand-contrast disabled:opacity-50">
              Start saving
            </button>
            <button type="button" onClick={() => setAdding(false)} className="min-h-12 rounded-xl px-4 font-bold text-brand">
              Cancel
            </button>
          </div>
        </form>
      )}

      {live.length ? (
        <ul className="mt-3 flex flex-col gap-3">
          {live.map((p) => {
            const g = projectProgress(p, entries);
            return (
              <li key={p.id} className="rounded-xl border border-line p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-bold">
                    {p.kind === "upgrade" ? "✨ " : "🔨 "}
                    {p.title}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 text-xs font-bold ${p.status === "saving" ? "border border-line" : "bg-ok-bg text-ok-fg"}`}>
                    {p.status === "saving" ? "Saving" : p.status === "funded" ? "✓ Funded" : "✓ Done"}
                  </span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-base" role="img" aria-label={`${g.pct}% of the target`}>
                  <div className="h-full bg-brand" style={{ width: `${g.pct}%` }} />
                </div>
                <p className="mt-1 text-sm tabular">
                  {kes(g.raised)} of {kes(p.target_kes)}
                  {g.left > 0 ? ` · ${kes(g.left)} to go` : ""}
                  {g.spent > 0 ? ` · ${kes(g.spent)} spent` : ""}
                </p>
                {p.status !== "done" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {p.status === "saving" && (
                      <button type="button" onClick={() => onGive(p)} className="min-h-12 rounded-xl bg-brand px-4 font-bold text-brand-contrast">
                        + Add money
                      </button>
                    )}
                    <button type="button" onClick={() => onSpend(p)} className="min-h-12 rounded-xl border border-line px-3 font-bold">
                      Log spending
                    </button>
                    {p.status === "funded" && (
                      <button type="button" onClick={() => onDone(p)} className="min-h-12 rounded-xl px-3 font-bold text-brand">
                        It&apos;s done
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        !adding && <p className="mt-2 text-sm text-muted">No projects yet. Start one for a repair or an upgrade the house wants.</p>
      )}
    </section>
  );
}
