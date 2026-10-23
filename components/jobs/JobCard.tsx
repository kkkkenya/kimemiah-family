"use client";

import { useEffect, useState } from "react";
import { useSync } from "@/components/SyncProvider";
import { joinJob, leaveJob, rescueJob, sendThanks, updateJob } from "@/lib/jobs/actions";
import { sendAlertsNow } from "@/lib/push/client";
import {
  coverage,
  formatMinutes,
  jobSize,
  jobStatus,
  meantToDoIt,
  shareChoices,
  shareMinutes,
  waitingDays,
  workers,
  type Job,
  type Participant,
} from "@/lib/jobs/logic";
import { PART_NOTES, TOOLS_FOR, type Category } from "@/lib/jobs/templates";
import { postJob, dayPlus, dueOnDay } from "@/lib/jobs/actions";
import { BottomSheet } from "@/components/BottomSheet";
import { whatsappHref } from "@/lib/contacts";
import { useRows } from "@/lib/sync/hooks";
import { syncEngine } from "@/lib/sync/client";
import type { StockItem } from "@/lib/shopping/shops";
import { kes } from "@/lib/shopping/pricing";

export const STRAIN = {
  light: { icon: "🌿", word: "Light", cls: "bg-ok-bg text-ok-fg" },
  medium: { icon: "⚡", word: "Medium", cls: "bg-low-bg text-low-fg" },
  heavy: { icon: "🏋️", word: "Heavy", cls: "bg-out-bg text-out-fg" },
} as const;

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-KE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });
const dayLabel = (d: string) => new Date(`${d}T09:00:00Z`).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" });

type Props = {
  job: Job;
  parts: Participant[];
  meId?: string;
  nameOf: (id: string | null | undefined) => string;
  thanked: (jobId: string, to: string) => boolean;
  onMessage: (text: string, undo?: () => void) => void;
  homeNames?: string[]; // others at home right now, to suggest for rescues and handovers
  agendaAfter?: number; // days with nobody on it before it goes on the meeting agenda
  suggestedFor?: string | null; // member suggested for this job (has given least lately); never assigned
  tools?: StockItem[]; // Stock tools, to show where this job's tools are and check them back in
  supper?: string | null; // "Cooking for 4 tonight (Vinnie is out)" on cooking jobs
};

type Start = "join" | "help" | "done" | null;

// Everything about one job, shown in its detail sheet.
function JobDetails({ job, parts, meId, nameOf, thanked, onMessage, homeNames = [], agendaAfter = 3, suggestedFor = null, tools = [], supper = null, start = null }: Props & { start?: Start }) {
  const { online, syncNow } = useSync();
  const [joining, setJoining] = useState<"join" | "help" | null>(null);
  const [pct, setPct] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const status = jobStatus(job, parts);
  const size = jobSize(job);
  const people = workers(job.id, parts);
  const mine = people.find((p) => p.member_id === meId);
  const covered = coverage(job.id, parts);
  const { choices, suggested } = shareChoices(job, parts, meId);
  const missingPeople = Math.max(0, job.people_needed - people.length);
  const strain = STRAIN[job.strain];
  const waiting = waitingDays(job, parts);
  const home = homeNames.filter((n) => !people.some((p) => nameOf(p.member_id) === n));

  async function run(action: () => Promise<string | null>, ok: string) {
    setBusy(true);
    const err = await action();
    setBusy(false);
    if (err) return onMessage(err);
    setJoining(null);
    setLeaving(false);
    setNote("");
    onMessage(ok);
    void syncNow();
  }

  function openJoin(kind: "join" | "help") {
    setPct(kind === "help" ? 30 : mine ? mine.effort_pct : suggested);
    setJoining(kind);
  }

  const jobTools = (TOOLS_FOR[job.template_key ?? ""] ?? []).map((n) => tools.find((t) => t.name === n)).filter((t): t is StockItem => !!t);
  const [returning, setReturning] = useState(false);
  const [putBack, setPutBack] = useState("Store room");
  const [broken, setBroken] = useState<Set<string>>(new Set());

  // Done on a job with tools: say where they went back, and if anything needs fixing.
  async function doneWithTools() {
    for (const t of jobTools) {
      const fix = broken.has(t.id);
      await syncEngine().queue("stock_items", "update", { id: t.id, tool_location: putBack, tool_condition: fix ? "needs_fix" : "working", last_used_by: meId ?? null });
      if (fix) await postJob({ title: `Fix or sharpen the ${t.name.toLowerCase()}`, category: "maintenance_fix", strain: "medium", duration_min: 30, people_needed: 1, due_at: dueOnDay(dayPlus(2)) });
    }
    setReturning(false);
    await markDone();
  }

  async function markDone() {
    await updateJob(job.id, { done_at: new Date().toISOString(), done_by: meId ?? null });
    void syncNow();
    onMessage(`${job.title}: done. Asante!`, () => updateJob(job.id, { done_at: null, done_by: null }).then(() => void syncNow()));
  }

  useEffect(() => {
    if (start === "join") openJoin("join");
    else if (start === "help") openJoin("help");
    else if (start === "done") setReturning(true);
    // Only when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const peterPhone = ((useRows<{ id: string; is_remote?: boolean; phone?: string | null }>("members") ?? []).find((m) => m.is_remote)?.phone) ?? null;
  const dadMessage = `Hi Peter, ${job.title.replace(/^Ask Peter to /i, "could you please ")}.${job.notes ? ` ${job.notes}` : ""} Thank you!`;

  return (
    <div className="pt-1">
      {status === "overdue" && (
        <p className="mb-2 rounded-lg bg-low-bg px-3 py-2 text-sm text-low-fg">
          <strong>⚠️ Meant to be done by {meantToDoIt(job.id, parts).map(nameOf).join(" and ") || "someone"}</strong>, but it wasn&apos;t finished in time. You can
          jump in to help, or take it over (with anyone willing to help).
          {home.length > 0 && <> At home now: {home.join(", ")}.</>}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
        <span className={`rounded-md px-2 py-0.5 ${strain.cls}`}>
          <span aria-hidden="true">{strain.icon} </span>
          {strain.word}
        </span>
        {job.urgent && !job.done_at && <span className="rounded-md bg-out-bg px-2 py-0.5 text-out-fg">Urgent</span>}
        {job.people_needed > 1 && <span className="rounded-md border border-line px-2 py-0.5">💪 Team-up</span>}
        {job.parent_job_id && <span className="rounded-md border border-line px-2 py-0.5">Step 2</span>}
        {job.rota_date && <span className="rounded-md border border-line px-2 py-0.5">Weekly grid</span>}
        {suggestedFor && !job.done_at && (
          <span className={`rounded-md px-2 py-0.5 ${suggestedFor === meId ? "bg-brand text-brand-contrast" : "border border-brand text-brand"}`}>
            {suggestedFor === meId ? "Suggested for you" : `Suggested: ${nameOf(suggestedFor)}`}
          </span>
        )}
        {waiting >= 1 && (
          <span className={`rounded-md px-2 py-0.5 ${waiting >= agendaAfter ? "bg-low-bg text-low-fg" : "border border-line"}`}>
            Waiting {waiting === 1 ? "1 day" : `${waiting} days`}
            {waiting >= agendaAfter && " · on the meeting agenda"}
          </span>
        )}
      </div>
      <h3 className="mt-1 text-lg font-bold">{job.title}</h3>
      <p className="text-sm tabular">
        {formatMinutes(job.duration_min)} × {job.people_needed === 1 ? "1 person" : `${job.people_needed} people`} ·{" "}
        <strong>
          {size.label} job ({formatMinutes(size.personMinutes)} of work)
        </strong>
      </p>
      {job.notes && <p className="text-sm text-muted">{job.notes}</p>}
      {supper && job.category === "cooking_house" && !job.done_at && <p className="text-sm font-bold text-ok-fg">🍽️ {supper}</p>}
      {jobTools.length > 0 && !job.done_at && (
        <p className="text-sm text-muted">🧰 {jobTools.map((t) => `${t.name}: ${t.tool_location ?? "not sure where"}${t.tool_condition === "needs_fix" ? " (needs fixing)" : ""}`).join(" · ")}</p>
      )}
      {returning && (
        <div className="mt-2 flex flex-col gap-2 rounded-xl border border-line p-3">
          <p className="font-bold">Where did the tools go back?</p>
          <div role="radiogroup" aria-label="Where the tools went" className="flex flex-wrap gap-2">
            {["Store room", "Back verandah", "Dog kennel", "Main house"].map((l) => (
              <button key={l} type="button" role="radio" aria-checked={putBack === l} onClick={() => setPutBack(l)} className={`min-h-10 rounded-md border px-3 text-sm font-bold ${putBack === l ? "border-brand bg-brand text-brand-contrast" : "border-line"}`}>
                {l}
              </button>
            ))}
          </div>
          {jobTools.map((t) => (
            <label key={t.id} className="flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={broken.has(t.id)}
                onChange={() =>
                  setBroken((b) => {
                    const n = new Set(b);
                    if (n.has(t.id)) n.delete(t.id);
                    else n.add(t.id);
                    return n;
                  })
                }
                className="size-5"
              />
              {t.name} needs fixing or sharpening
            </label>
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={doneWithTools} className="min-h-12 rounded-xl bg-brand px-4 font-bold text-brand-contrast">
              ✓ Done
            </button>
            <button type="button" onClick={() => setReturning(false)} className="min-h-12 rounded-xl px-4 font-bold text-brand">
              Not yet
            </button>
          </div>
        </div>
      )}
      {!job.done_at && job.due_at && <p className="text-sm text-muted">Due {when(job.due_at)}</p>}
      {!job.done_at && job.started_at && <p className="text-sm text-ok-fg">Started {when(job.started_at)}</p>}

      {job.requires_funds && !job.done_at && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-base px-3 py-2 text-sm">
          <span>
            {job.planned_for && <>Planned for {dayLabel(job.planned_for)} · </>}
            {job.estimated_cost_kes ? <>about {kes(job.estimated_cost_kes)} · </> : null}
            <strong>{job.funds_status === "funds_ready" ? "Money ready" : "Money still being arranged"}</strong>
          </span>
          {job.funds_status === "discussing" && (
            <button type="button" onClick={() => updateJob(job.id, { funds_status: "funds_ready" }).then(() => void syncNow())} className="min-h-12 rounded-xl border border-brand px-3 font-bold text-brand">
              Money is ready
            </button>
          )}
        </div>
      )}

      {/* Who is on it, and how much is covered */}
      {!job.done_at && (
        <div className="mt-3">
          <div className="h-3 overflow-hidden rounded-full bg-base" role="img" aria-label={`${covered}% covered`}>
            <div className="h-full bg-brand" style={{ width: `${Math.min(100, covered)}%` }} />
          </div>
          <p className="mt-1 text-sm">
            {people.length
              ? people.map((p) => `${nameOf(p.member_id)} ${p.effort_pct}%${p.role_note ? ` (${p.role_note})` : ""}`).join(" · ")
              : "Nobody yet"}
            {covered < 100 && ` · ${100 - covered}% left`}
            {missingPeople > 0 && covered > 0 && ` · needs ${missingPeople} more ${missingPeople === 1 ? "person" : "people"}`}
          </p>
        </div>
      )}

      {job.done_at ? (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-sm text-ok-fg">
            ✓ Done {when(job.done_at)}
            {people.length ? ` by ${people.map((p) => nameOf(p.member_id)).join(", ")}` : job.done_by ? ` by ${nameOf(job.done_by)}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {[...new Set([...people.map((p) => p.member_id), ...(job.done_by && !people.length ? [job.done_by] : [])])]
              .filter((m) => m !== meId)
              .map((m) =>
                thanked(job.id, m) ? (
                  <span key={m} className="rounded-md bg-ok-bg px-3 py-2 text-sm font-bold text-ok-fg">
                    ✓ Asante sent to {nameOf(m)}
                  </span>
                ) : (
                  <button
                    key={m}
                    type="button"
                    onClick={() => sendThanks(job.id, m).then(() => (void syncNow(), onMessage(`Asante sent to ${nameOf(m)}`)))}
                    className="min-h-12 rounded-md border border-brand px-4 font-bold text-brand"
                  >
                    🙏 Asante, {nameOf(m)}
                  </button>
                ),
              )}
          </div>
        </div>
      ) : joining ? (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-line p-3">
          <p className="font-bold">{joining === "help" ? "How much will you help with?" : mine ? "Change your share" : "Your share"}</p>
          <div role="radiogroup" aria-label="Your share" className="flex flex-wrap gap-2">
            {(joining === "help" ? [20, 30, 40, 50] : choices).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={pct === c}
                onClick={() => setPct(c)}
                className={`min-h-12 rounded-xl border px-3 text-sm font-bold leading-tight ${pct === c ? "border-brand bg-brand text-brand-contrast" : "border-line"}`}
              >
                {c === 100 ? "100% (solo)" : `${c}%`}
                <span className="block font-normal">~{formatMinutes(shareMinutes(job, c))}</span>
              </button>
            ))}
          </div>
          {joining === "join" && (
            <>
              <div className="flex flex-wrap gap-2">
                {(PART_NOTES[job.category as Category] ?? []).map((n) => (
                  <button key={n} type="button" aria-pressed={note === n} onClick={() => setNote(note === n ? "" : n)} className={`min-h-10 rounded-md border px-3 text-sm ${note === n ? "border-brand font-bold text-brand" : "border-line"}`}>
                    {n}
                  </button>
                ))}
              </div>
              <label className="sr-only" htmlFor={`note-${job.id}`}>
                My part (optional)
              </label>
              <input id={`note-${job.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="My part (optional)" className="min-h-12 rounded-xl border border-line bg-base px-3" />
            </>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !pct || !online}
              onClick={() =>
                run(
                  () => (joining === "help" ? rescueJob(job.id, pct, false) : joinJob(job.id, pct, note)),
                  joining === "help" ? `You're helping with ${pct}%` : `You're on it: ${pct}% (~${formatMinutes(shareMinutes(job, pct))})`,
                )
              }
              className="min-h-12 flex-1 rounded-xl bg-brand font-bold text-brand-contrast disabled:opacity-50"
            >
              {!online ? "Needs signal" : busy ? "Saving…" : mine ? "Save my share" : "I'm in"}
            </button>
            <button type="button" onClick={() => setJoining(null)} className="min-h-12 rounded-xl px-4 font-bold text-brand">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {status === "overdue" && !mine && (
            <>
              <button type="button" disabled={!online} onClick={() => openJoin("help")} className="min-h-12 rounded-xl border border-brand px-4 font-bold text-brand disabled:opacity-50">
                🤝 Help them finish
              </button>
              <button
                type="button"
                disabled={!online || busy}
                onClick={() => run(() => rescueJob(job.id, null, true), `You took over ${job.title}. Asante!`)}
                className="min-h-12 rounded-xl bg-brand px-4 font-bold text-brand-contrast disabled:opacity-50"
              >
                💪 Take it over
              </button>
            </>
          )}
          {status !== "overdue" && !mine && choices.length > 0 && status !== "planning" && (
            <button type="button" disabled={!online} onClick={() => openJoin("join")} className="min-h-12 rounded-xl bg-brand px-4 font-bold text-brand-contrast disabled:opacity-50">
              {people.length ? "Join in" : "I'll do it"}
            </button>
          )}
          {status === "planning" && !mine && choices.length > 0 && (
            <button type="button" disabled={!online} onClick={() => openJoin("join")} className="min-h-12 rounded-xl border border-brand px-4 font-bold text-brand disabled:opacity-50">
              I&apos;ll go
            </button>
          )}
          {mine && leaving && (
            <div className="flex w-full flex-col gap-2 rounded-xl border border-line p-3">
              <p>
                Leave your {mine.effort_pct}%? It goes back on the board
                {home.length ? ` for whoever's at home (${home.join(", ")})` : ""}.
              </p>
              <div className="flex gap-2">
                <button type="button" disabled={!online || busy} onClick={() => run(async () => (await leaveJob(job.id)) ?? (void sendAlertsNow(), null), `You left ${job.title}. It's back on the board.`)} className="min-h-12 rounded-xl bg-brand px-4 font-bold text-brand-contrast disabled:opacity-50">
                  Leave it
                </button>
                <button type="button" onClick={() => setLeaving(false)} className="min-h-12 rounded-xl px-4 font-bold text-brand">
                  Keep it
                </button>
              </div>
            </div>
          )}
          {mine && !leaving && (
            <>
              {!job.started_at && (
                <button
                  type="button"
                  onClick={() => updateJob(job.id, { started_at: new Date().toISOString() }).then(() => (void syncNow(), onMessage(`Started ${job.title}`)))}
                  className="min-h-12 rounded-xl border border-brand px-4 font-bold text-brand"
                >
                  ▶ I&apos;m starting
                </button>
              )}
              <button type="button" onClick={() => (jobTools.length ? setReturning(true) : markDone())} className="min-h-12 rounded-xl bg-brand px-4 font-bold text-brand-contrast">
                ✓ Done
              </button>
              <button type="button" disabled={!online} onClick={() => openJoin("join")} className="min-h-12 rounded-xl border border-line px-3 font-bold disabled:opacity-50">
                Change share
              </button>
              <button type="button" disabled={!online} onClick={() => setLeaving(true)} className="min-h-12 rounded-xl px-3 font-bold text-muted disabled:opacity-50">
                Leave
              </button>
            </>
          )}
          {job.category === "utilities_dad" && (
            <>
              <a href={whatsappHref(peterPhone, dadMessage) ?? `https://wa.me/?text=${encodeURIComponent(dadMessage)}`} target="_blank" rel="noreferrer" className="flex min-h-12 items-center rounded-xl border border-brand px-4 font-bold text-brand">
                Send to Peter on WhatsApp
              </a>
              <button type="button" onClick={() => updateJob(job.id, { funds_status: "paid_by_dad", done_at: new Date().toISOString(), done_by: meId ?? null }).then(() => void syncNow())} className="min-h-12 rounded-xl px-3 font-bold text-brand">
                Peter paid ✓
              </button>
            </>
          )}
          {!online && !mine && <p className="w-full text-sm text-muted">Taking a job needs signal, so two people don&apos;t take the same share.</p>}
        </div>
      )}
    </div>
  );
}

/**
 * One job in a list: name and tags, one status line, and one button. Tapping the card opens
 * everything else in a sheet (shares, notes, tools, Asante, Leave...).
 */
export function JobCard(props: Props) {
  const { job, parts, meId, nameOf, thanked, suggestedFor, tools = [] } = props;
  const { online, syncNow } = useSync();
  const [sheet, setSheet] = useState<{ start: Start } | null>(null);
  const status = jobStatus(job, parts);
  const people = workers(job.id, parts);
  const mine = people.some((p) => p.member_id === meId);
  const covered = coverage(job.id, parts);
  const size = jobSize(job);
  const strain = STRAIN[job.strain];
  const choices = shareChoices(job, parts, meId).choices;
  const hasTools = (TOOLS_FOR[job.template_key ?? ""] ?? []).some((n) => tools.some((t) => t.name === n));
  const unthanked = people.map((p) => p.member_id).filter((m) => m !== meId && !thanked(job.id, m));

  const line =
    status === "done"
      ? `✓ Done${people.length ? ` by ${people.map((p) => nameOf(p.member_id)).join(", ")}` : ""}`
      : status === "overdue"
        ? `⚠️ Past its time · meant for ${meantToDoIt(job.id, parts).map(nameOf).join(" and ") || "someone"}`
        : status === "planning"
          ? `Money run${job.planned_for ? ` · ${job.planned_for}` : ""} · ${job.funds_status === "funds_ready" ? "money ready" : "money being arranged"}`
          : people.length
            ? `${people.map((p) => `${nameOf(p.member_id)} ${p.effort_pct}%`).join(" · ")}${covered < 100 ? ` · ${100 - covered}% left` : ""}`
            : `${size.label} job · ${formatMinutes(job.duration_min)} × ${job.people_needed === 1 ? "1 person" : `${job.people_needed} people`}`;

  async function done() {
    if (hasTools) return setSheet({ start: "done" });
    await updateJob(job.id, { done_at: new Date().toISOString(), done_by: meId ?? null });
    void syncNow();
    props.onMessage(`${job.title}: done. Asante!`, () => updateJob(job.id, { done_at: null, done_by: null }).then(() => void syncNow()));
  }

  const action: { label: string; run: () => void; needsSignal?: boolean } =
    mine && !job.done_at
      ? { label: "✓ Done", run: done }
      : status === "overdue"
        ? { label: "🤝 Help", run: () => setSheet({ start: "help" }), needsSignal: true }
        : !job.done_at && choices.length && (status === "open" || status === "partial" || status === "planning")
          ? { label: status === "planning" ? "I'll go" : people.length ? "Join in" : "I'll do it", run: () => setSheet({ start: "join" }), needsSignal: true }
          : job.done_at && unthanked.length
            ? { label: "🙏 Asante", run: () => setSheet({ start: null }) }
            : { label: "Details", run: () => setSheet({ start: null }) };

  return (
    <li className={`rounded-2xl bg-raised border border-line ${status === "overdue" ? "border-2 border-out-strong" : ""}`}>
      <div className="flex items-center gap-3 p-4">
        <button type="button" onClick={() => setSheet({ start: null })} className="min-w-0 flex-1 text-left">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold">{job.title}</span>
            <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${strain.cls}`}>
              <span aria-hidden="true">{strain.icon} </span>
              {strain.word}
            </span>
            {job.urgent && !job.done_at && <span className="rounded-md bg-out-bg px-2 py-0.5 text-xs font-bold text-out-fg">Urgent</span>}
            {suggestedFor === meId && !job.done_at && <span className="rounded-md bg-brand px-2 py-0.5 text-xs font-bold text-brand-contrast">For you</span>}
          </span>
          <span className="mt-0.5 block text-sm text-muted tabular">{line}</span>
        </button>
        <button
          type="button"
          disabled={action.needsSignal && !online}
          onClick={action.run}
          className="min-h-12 shrink-0 rounded-xl bg-brand px-4 font-bold text-brand-contrast disabled:opacity-50"
        >
          {action.needsSignal && !online ? "Needs signal" : action.label}
        </button>
      </div>
      {sheet && (
        <BottomSheet title={job.title} onClose={() => setSheet(null)}>
          <JobDetails
            {...props}
            start={sheet.start}
            onMessage={(t, u) => {
              props.onMessage(t, u);
              if (/done|left|helping|on it|took over/i.test(t)) setSheet(null);
            }}
          />
        </BottomSheet>
      )}
    </li>
  );
}
