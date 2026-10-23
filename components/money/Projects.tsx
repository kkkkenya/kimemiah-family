"use client";

import { useRef, useState, type FormEvent } from "react";
import { useFamilyImage } from "@/lib/images";
import { kes } from "@/lib/shopping/pricing";
import { chippedIn, projectPace, projectProgress, type Entry, type Project } from "@/lib/money/money";

export type Goal = Project & { target_date?: string | null; emoji?: string | null; photo_at?: string | null; planned_monthly_kes?: number | null; done_at?: string | null; created_at?: string };

const field = "min-h-12 w-full rounded-xl border border-line bg-base px-3";
const EMOJI = ["🔨", "🎨", "🚪", "🛋️", "🧺", "🍳", "💡", "🌱", "🐕", "🎓", "🚗", "✨"];

// Goals the family saves up for: house work (painting, repairs) and quality-of-life upgrades.
// Each one has a picture (a photo or an emoji), a pace to its date, and a list of who chipped in.
// Money given to a goal is set aside; when it reaches the target, its job opens up.
export function Projects({
  projects,
  entries,
  onNew,
  onGive,
  onSpend,
  onDone,
  onEdit,
  onPhoto,
  nameOf,
  today,
}: {
  projects: Goal[];
  entries: Entry[];
  onNew: (p: { title: string; kind: Project["kind"]; target_kes: number; notes: string; postJob: boolean; target_date: string | null; emoji: string; planned_monthly_kes: number | null }) => void;
  onGive: (p: Project) => void;
  onSpend: (p: Project) => void;
  onDone: (p: Project) => void;
  onEdit: (p: Goal, changes: Partial<Goal>) => void;
  onPhoto: (p: Goal, file: File) => Promise<boolean>;
  nameOf: (id: string) => string;
  today: string;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Project["kind"]>("house_work");
  const [emoji, setEmoji] = useState("🔨");
  const [target, setTarget] = useState("");
  const [planned, setPlanned] = useState("");
  const [notes, setNotes] = useState("");
  const [by, setBy] = useState("");
  const [postJob, setPostJob] = useState(true);
  const live = projects.filter((p) => !p.deleted_at).sort((a, b) => (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0));
  const value = Number(target.replace(/[, ]/g, ""));
  const monthly = Number(planned.replace(/[, ]/g, ""));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !(value > 0)) return;
    onNew({ title: title.trim(), kind, target_kes: value, notes: notes.trim(), postJob: kind === "house_work" && postJob, target_date: by || null, emoji, planned_monthly_kes: monthly > 0 ? monthly : null });
    setAdding(false);
    setTitle("");
    setTarget("");
    setPlanned("");
    setNotes("");
    setBy("");
  }

  return (
    <section aria-labelledby="projects" className="rounded-2xl border border-line bg-raised p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="projects" className="font-display text-xl">
          Goals
        </h2>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="min-h-12 rounded-xl border border-ink px-4 text-sm font-bold">
            + New goal
          </button>
        )}
      </div>
      <p className="text-sm text-muted">Save up for house work and upgrades. Money given here is set aside, not shopping money.</p>

      {adding && (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-3 rounded-xl border border-line p-3">
          <div role="radiogroup" aria-label="Kind of goal" className="grid grid-cols-2 gap-2">
            {(
              [
                ["house_work", "🔨 House work"],
                ["upgrade", "✨ Upgrade"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => {
                  setKind(k);
                  setEmoji(k === "upgrade" ? "✨" : "🔨");
                }}
                className={`min-h-12 rounded-xl border font-bold ${kind === k ? "border-brand bg-brand text-brand-contrast" : "border-line"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-sm font-bold">
            What is it?
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "house_work" ? "e.g. Repaint the gate" : "e.g. New mop, bucket and basin"} className={field} />
          </label>
          <EmojiPicker value={emoji} onChange={setEmoji} />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm font-bold">
              Target (KES)
              <input inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} className={`${field} tabular`} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold">
              By when?
              <input type="date" value={by} min={today} onChange={(e) => setBy(e.target.value)} className={field} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-bold">
            Planned each month (KES, optional)
            <input inputMode="numeric" value={planned} onChange={(e) => setPlanned(e.target.value)} placeholder="What the family means to put in" className={`${field} tabular`} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold">
            Notes
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional: what's needed, where to buy" className={field} />
          </label>
          {kind === "house_work" && (
            <label className="flex min-h-12 items-center gap-3 text-sm">
              <input type="checkbox" checked={postJob} onChange={(e) => setPostJob(e.target.checked)} className="size-6" />
              Also post it on Jobs (it opens once the money is there)
            </label>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={!title.trim() || !(value > 0)} className="min-h-12 flex-1 rounded-xl bg-brand font-bold text-brand-contrast disabled:opacity-50">
              Start saving
            </button>
            <button type="button" onClick={() => setAdding(false)} className="min-h-12 rounded-xl px-4 font-bold">
              Cancel
            </button>
          </div>
        </form>
      )}

      {live.length ? (
        <ul className="mt-3 grid gap-3 lg:grid-cols-2">
          {live.map((p) => (
            <GoalCard key={p.id} p={p} entries={entries} today={today} nameOf={nameOf} onGive={onGive} onSpend={onSpend} onDone={onDone} onEdit={onEdit} onPhoto={onPhoto} />
          ))}
        </ul>
      ) : (
        !adding && <p className="mt-2 text-sm text-muted">No goals yet. Start one for a repair or an upgrade the house wants.</p>
      )}
    </section>
  );
}

function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Picture" className="flex flex-wrap gap-1.5">
      {EMOJI.map((e) => (
        <button key={e} type="button" role="radio" aria-checked={value === e} aria-label={e} onClick={() => onChange(e)} className={`flex size-11 items-center justify-center rounded-xl text-xl ${value === e ? "bg-action" : "bg-base"}`}>
          {e}
        </button>
      ))}
    </div>
  );
}

function GoalCard({
  p,
  entries,
  today,
  nameOf,
  onGive,
  onSpend,
  onDone,
  onEdit,
  onPhoto,
}: {
  p: Goal;
  entries: Entry[];
  today: string;
  nameOf: (id: string) => string;
  onGive: (p: Project) => void;
  onSpend: (p: Project) => void;
  onDone: (p: Project) => void;
  onEdit: (p: Goal, changes: Partial<Goal>) => void;
  onPhoto: (p: Goal, file: File) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [planned, setPlanned] = useState(p.planned_monthly_kes ? String(p.planned_monthly_kes) : "");
  const file = useRef<HTMLInputElement>(null);
  const photo = useFamilyImage(p.photo_at ? `goals/${p.id}.jpg` : null, p.photo_at ?? "");
  const g = projectProgress(p, entries);
  const pace = p.status === "saving" ? projectPace(p, entries, today) : null;
  const givers = chippedIn(p, entries, nameOf);
  const icon = p.emoji || (p.kind === "upgrade" ? "✨" : "🔨");

  return (
    <li className="overflow-hidden rounded-xl border border-line">
      <div className="relative flex h-24 items-center justify-center bg-gradient-to-br from-low-bg to-base text-4xl" aria-hidden={!photo}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL, not optimisable */}
        {photo ? <img src={photo} alt={p.title} className="absolute inset-0 size-full object-cover" /> : icon}
        <span className={`absolute right-2 top-2 rounded-md px-2 py-0.5 text-xs font-bold ${p.status === "saving" ? "bg-raised text-ink" : "bg-ok-bg text-ok-fg"}`}>{p.status === "saving" ? "Saving" : p.status === "funded" ? "✓ Funded" : "✓ Done"}</span>
      </div>
      <div className="flex flex-col gap-2 p-4">
        <h3 className="font-display text-xl">{p.title}</h3>
        <div className="h-2.5 overflow-hidden rounded-full bg-base" role="img" aria-label={`${g.pct}% of the target`}>
          <div className="h-full rounded-full bg-ok-fg" style={{ width: `${g.pct}%` }} />
        </div>
        <p className="text-sm tabular">
          {kes(g.raised)} of {kes(p.target_kes)}
          {g.left > 0 ? ` · ${kes(g.left)} to go` : ""}
          {g.spent > 0 ? ` · ${kes(g.spent)} spent` : ""}
        </p>
        {pace && (
          <p className="text-sm">
            {pace.late ? (
              <span className="font-bold text-out-strong">Past its date. Pick a new one or add money.</span>
            ) : (
              <>
                {kes(pace.perMonth)} a month makes it by {new Date(`${p.target_date}T09:00:00Z`).toLocaleDateString("en-KE", { month: "short", year: "numeric" })}
                {" · "}
                <span className={pace.ahead >= 0 ? "text-ok-fg" : "font-bold text-low-fg"}>{pace.ahead >= 0 ? "on track" : `${kes(-pace.ahead)} behind`}</span>
              </>
            )}
          </p>
        )}
        {p.planned_monthly_kes ? <p className="text-sm text-muted">Planned: {kes(p.planned_monthly_kes)} a month</p> : null}
        {givers.length > 0 && <p className="text-sm">Chipped in: {givers.join(", ")}</p>}

        {editing && (
          <div className="flex flex-col gap-3 rounded-xl bg-base p-3">
            <EmojiPicker value={icon} onChange={(e) => onEdit(p, { emoji: e })} />
            <label className="flex flex-col gap-1 text-sm font-bold">
              Planned each month (KES)
              <span className="flex gap-2">
                <input inputMode="numeric" value={planned} onChange={(e) => setPlanned(e.target.value)} className={`${field} tabular`} />
                <button
                  type="button"
                  onClick={() => {
                    const v = Number(planned.replace(/[, ]/g, ""));
                    onEdit(p, { planned_monthly_kes: v > 0 ? v : null });
                  }}
                  className="min-h-12 shrink-0 rounded-xl border border-ink px-4"
                >
                  Save
                </button>
              </span>
            </label>
            <input
              ref={file}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBusy(true);
                await onPhoto(p, f);
                setBusy(false);
              }}
            />
            <button type="button" disabled={busy} onClick={() => file.current?.click()} className="min-h-12 rounded-xl border border-line bg-raised font-bold disabled:opacity-50">
              {busy ? "Uploading…" : p.photo_at ? "Change the photo" : "Add a photo"}
            </button>
          </div>
        )}

        {p.status !== "done" && (
          <div className="flex flex-wrap gap-2">
            {p.status === "saving" && (
              <button type="button" onClick={() => onGive(p)} className="min-h-12 rounded-xl bg-brand px-5 font-bold text-brand-contrast">
                + Add money
              </button>
            )}
            <button type="button" onClick={() => onSpend(p)} className="min-h-12 rounded-xl border border-line px-4 font-bold">
              Log spending
            </button>
            {p.status === "funded" && (
              <button type="button" onClick={() => onDone(p)} className="min-h-12 rounded-xl border border-ink px-4 font-bold">
                It&apos;s done 🎉
              </button>
            )}
            <button type="button" onClick={() => setEditing(!editing)} className="min-h-12 px-2 text-sm font-bold text-muted underline underline-offset-4">
              {editing ? "Close" : "Edit"}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
