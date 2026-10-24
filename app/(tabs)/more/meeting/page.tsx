"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { Card, Screen } from "@/components/Screen";
import { useSync } from "@/components/SyncProvider";
import { UndoBar, type UndoState } from "@/components/UndoBar";
import { JobStats } from "@/components/jobs/JobStats";
import { RotaGrid } from "@/components/jobs/RotaGrid";
import { DecisionForm, FollowUps, WhosHere } from "@/components/meeting/parts";
import { whatsappHref } from "@/lib/contacts";
import { dayPlus, dueOnDay, postJob } from "@/lib/jobs/actions";
import { forAgenda, waitingDays, type Job, type Participant } from "@/lib/jobs/logic";
import { household, type Person } from "@/lib/jobs/stats";
import { decisionState, followUps, meetingSummary, type DecisionRow, type MeetingRow } from "@/lib/meeting";
import { syncEngine } from "@/lib/sync/client";
import { useRows } from "@/lib/sync/hooks";
import type { Row, SyncTable } from "@/lib/sync/tables";

type Meeting = Row & MeetingRow;
type Agenda = Row & { meeting_id: string; title: string; minutes: number | null; source: string; source_job_id: string | null; sort: number };
type Decision = Row & DecisionRow;
type Settings = Row & { volunteer_after_days?: number; ground_rules?: string[] };
type Member = Person & { id: string; is_remote?: boolean; phone?: string | null };

// The usual 30-45 minutes (see 03-family-meeting.md).
const USUAL = [
  { title: "Welcome and ground rules", minutes: 5 },
  { title: "Appreciation round: everyone thanks someone (and taps Asante)", minutes: 10 },
  { title: "Jobs: anything waiting, and next week's sign-up grid", minutes: 10 },
  { title: "What's working, what's not", minutes: 10 },
  { title: "Decisions and the next meeting", minutes: 5 },
];

const dayLabel = (d: string) => new Date(`${d}T09:00:00Z`).toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" });
const field = "min-h-12 w-full rounded-xl border border-line bg-base px-3";
const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

/** Next Sunday (or today if it's Sunday), Nairobi. */
function nextSunday(): string {
  const now = new Date(Date.now() + 3 * 3600_000);
  const add = (7 - now.getUTCDay()) % 7;
  return dayPlus(add);
}

// Planning the family meeting: day, time, host, agenda, what happened to last time's decisions,
// who's here, decisions with an owner and a date, and the summary for Peter afterwards. On the
// day, "Start the meeting" runs it full screen (made for projecting from the laptop).
export default function MeetingPage() {
  const { syncNow } = useSync();
  const meetings = (useRows<Meeting>("meetings") ?? []).filter((m) => !m.deleted_at);
  const agenda = (useRows<Agenda>("agenda_items") ?? []).filter((a) => !a.deleted_at);
  const decisions = (useRows<Decision>("decisions") ?? []).filter((d) => !d.deleted_at);
  const jobs = (useRows<Job & { id: string }>("jobs") ?? []) as Job[];
  const parts = (useRows<Participant & { id: string }>("job_participants") ?? []) as Participant[];
  const members = ((useRows<Member>("members") ?? []) as Member[]).filter((p) => p.active !== false).sort((a, b) => a.sort - b.sort);
  const people = household(members);
  const settings = (useRows<Settings>("settings") ?? [])[0];
  const [undo, setUndo] = useState<UndoState>(null);
  const closeUndo = useCallback(() => setUndo(null), []);
  const [newItem, setNewItem] = useState("");
  const [notes, setNotes] = useState<string | null>(null);
  const [summaryFor, setSummaryFor] = useState<Meeting | null>(null);

  const change = async (table: SyncTable, op: "insert" | "update" | "delete", row: Row) => {
    await syncEngine().queue(table, op, row);
    void syncNow();
  };

  const byDate = (a: Meeting, b: Meeting) => (a.held_on ?? "").localeCompare(b.held_on ?? "");
  const next = meetings.filter((m) => m.status === "planned").sort(byDate)[0];
  const past = meetings.filter((m) => m.status === "held").sort(byDate).reverse();
  const items = next ? agenda.filter((a) => a.meeting_id === next.id).sort((a, b) => a.sort - b.sort) : [];
  const nextDecisions = next ? decisions.filter((d) => d.meeting_id === next.id) : [];
  const followed = followUps(meetings, decisions, jobs, today());
  const after = settings?.volunteer_after_days ?? 3;
  const waiting = forAgenda(jobs, parts, after).filter((j) => !items.some((a) => a.source_job_id === j.id));
  const nameOf = (id: string | null) => members.find((p) => p.id === id)?.name ?? "Not picked";
  const peter = members.find((p) => p.is_remote);

  function nextHost(): string | null {
    const last = past[0]?.host_id;
    const i = people.findIndex((p) => p.id === last);
    return people[(i + 1) % Math.max(1, people.length)]?.id ?? null;
  }

  async function plan(day = nextSunday()) {
    await change("meetings", "insert", { id: crypto.randomUUID(), held_on: day, host_id: nextHost(), notes: null, status: "planned", attendees: [], start_time: next?.start_time ?? past[0]?.start_time ?? "17:00" });
  }

  async function addItem(title: string, minutes: number | null, source = "manual", jobId: string | null = null, at?: number) {
    if (!next || !title.trim()) return;
    const sort = at ?? (items.at(-1)?.sort ?? 0) + 1;
    await change("agenda_items", "insert", { id: crypto.randomUUID(), meeting_id: next.id, title: title.trim(), minutes, source, source_job_id: jobId, sort });
  }

  async function addUsual() {
    // Positions set up front: the list on screen doesn't refresh between these adds.
    const start = (items.at(-1)?.sort ?? 0) + 1;
    for (const [i, u] of USUAL.entries()) await addItem(u.title, u.minutes, "template", null, start + i);
  }

  async function makeJob(d: Decision) {
    const jobId = await postJob({ title: d.text, category: "house_cleaning", strain: "medium", duration_min: 30, people_needed: 1, due_at: dueOnDay(d.due_on ?? dayPlus(3)), notes: "From the family meeting" });
    await change("decisions", "update", { id: d.id, job_id: jobId });
    setUndo({ id: Date.now(), message: "Posted on the Jobs board" });
  }

  async function held() {
    if (!next) return;
    await change("meetings", "update", { id: next.id, status: "held" });
    // Line up the next one two weeks on, with the next host.
    const twoWeeksOn = new Date(Date.parse(`${next.held_on ?? dayPlus(0)}T09:00:00Z`) + 14 * 86400_000).toISOString().slice(0, 10);
    await plan(twoWeeksOn > dayPlus(0) ? twoWeeksOn : dayPlus(14));
    setSummaryFor({ ...next, status: "held" });
  }

  const total = items.reduce((s, a) => s + (a.minutes ?? 0), 0);

  return (
    <Screen title="Meeting" back="/" tone="monarch">
      {!next ? (
        <Card>
          <h2 className="font-display text-xl">Next family meeting</h2>
          <p className="text-muted">Nothing planned yet. Every two weeks works well, 30 to 45 minutes.</p>
          <button type="button" onClick={() => plan()} className="mt-3 min-h-12 rounded-xl bg-brand px-5 font-bold text-brand-contrast">
            Plan the next meeting ({dayLabel(nextSunday())})
          </button>
        </Card>
      ) : (
        <>
          <section className="rounded-2xl border border-line bg-raised p-5 lg:[column-span:all] lg:p-8">
            <p className="eyebrow eyebrow-accent">Next family meeting</p>
            <p className="font-display text-3xl lg:text-4xl">{next.held_on ? dayLabel(next.held_on) : "No day set"}</p>
            <p className="text-muted">
              {next.start_time ?? "17:00"} · hosted by {nameOf(next.host_id)} · {items.length ? `${items.length} on the agenda, about ${total} min` : "no agenda yet"}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1 text-sm font-bold">
                Day
                <input type="date" value={next.held_on ?? ""} onChange={(e) => change("meetings", "update", { id: next.id, held_on: e.target.value })} className={field} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-bold">
                Time
                <input type="time" value={next.start_time ?? "17:00"} onChange={(e) => e.target.value && change("meetings", "update", { id: next.id, start_time: e.target.value })} className={field} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-bold">
                Host
                <select value={next.host_id ?? ""} onChange={(e) => change("meetings", "update", { id: next.id, host_id: e.target.value || null })} className={field}>
                  <option value="">Not picked</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Link href="/more/meeting/run" className="mt-4 flex min-h-14 items-center justify-center rounded-xl bg-brand px-6 text-lg font-bold text-brand-contrast lg:inline-flex">
              ▶ Start the meeting
            </Link>
            <p className="mt-1 text-xs text-muted">Full screen, one item at a time, with a timer. Made for the laptop on the TV.</p>
          </section>

          <Card>
            <h2 className="font-display text-xl">Last time we decided</h2>
            <div className="mt-2">
              <FollowUps items={followed} nameOf={nameOf} onDone={(d) => change("decisions", "update", { id: d.id, done_at: new Date().toISOString() })} />
            </div>
          </Card>

          <Card>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-xl">Agenda</h2>
              {total > 0 && <span className="text-sm text-muted tabular">about {total} min</span>}
            </div>
            {items.length ? (
              <ol className="mt-2 flex flex-col divide-y divide-line">
                {items.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                    <span>
                      {a.title}
                      {a.minutes ? <span className="text-sm text-muted"> · {a.minutes} min</span> : null}
                      {a.source === "waiting_job" && <span className="ml-1 rounded-md bg-low-bg px-2 text-xs font-bold text-low-fg">waiting job</span>}
                      {a.source === "flag" && <span className="ml-1 rounded-md bg-base px-2 text-xs font-bold">question</span>}
                      {a.source === "money_review" && (
                        <a href="/money/review" className="ml-2 text-sm font-bold underline underline-offset-4">
                          Open the review
                        </a>
                      )}
                    </span>
                    <button type="button" aria-label={`Remove ${a.title}`} onClick={() => change("agenda_items", "delete", { id: a.id })} className="flex size-11 shrink-0 items-center justify-center text-muted">
                      ✕
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <button type="button" onClick={addUsual} className="mt-2 min-h-12 rounded-xl border border-ink px-5 font-bold">
                Use the usual agenda (40 min)
              </button>
            )}
            {waiting.length > 0 && (
              <div className="mt-3 rounded-xl bg-low-bg p-3 text-low-fg">
                <p className="font-bold">Jobs nobody has taken for {after}+ days</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {waiting.map((j) => (
                    <li key={j.id} className="flex items-center justify-between gap-2">
                      <span>
                        {j.title} ({waitingDays(j, parts)} days)
                      </span>
                      <button type="button" onClick={() => addItem(`Waiting job: ${j.title}`, 5, "waiting_job", j.id)} className="min-h-11 shrink-0 rounded-xl px-2 font-bold underline underline-offset-4">
                        Add
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void addItem(newItem, null);
                setNewItem("");
              }}
            >
              <label htmlFor="agenda-new" className="sr-only">
                Add to the agenda
              </label>
              <input id="agenda-new" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add something to talk about" className={field} />
              <button type="submit" disabled={!newItem.trim()} className="min-h-12 shrink-0 rounded-xl bg-brand px-5 font-bold text-brand-contrast disabled:opacity-50">
                Add
              </button>
            </form>
            {settings?.ground_rules?.length ? (
              <details className="mt-3">
                <summary className="min-h-12 cursor-pointer py-3 font-bold">Ground rules</summary>
                <ol className="list-decimal pl-5 text-sm">
                  {settings.ground_rules.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ol>
              </details>
            ) : null}
          </Card>

          <Card>
            <h2 className="font-display text-xl">Who&apos;s here</h2>
            <p className="mb-2 text-sm text-muted">Tap each person at the meeting. Peter counts when he&apos;s on a call.</p>
            <WhosHere people={members} here={next.attendees ?? []} onChange={(ids) => change("meetings", "update", { id: next.id, attendees: ids })} />
          </Card>

          <Card>
            <h2 className="font-display text-xl">Notes</h2>
            <label htmlFor="notes" className="sr-only">
              Meeting notes
            </label>
            <textarea
              id="notes"
              rows={4}
              value={notes ?? next.notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== null && notes !== (next.notes ?? "") && change("meetings", "update", { id: next.id, notes })}
              placeholder="What came up, in a few words"
              className="mt-2 w-full rounded-xl border border-line bg-base p-3"
            />
          </Card>

          <Card>
            <h2 className="font-display text-xl">Decisions</h2>
            {nextDecisions.length > 0 && (
              <ul className="mt-2 flex flex-col divide-y divide-line">
                {nextDecisions.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="block">{d.text}</span>
                      <span className="text-sm text-muted">
                        {d.owner_id ? nameOf(d.owner_id) : "Nobody named"}
                        {d.due_on ? ` · by ${new Date(`${d.due_on}T09:00:00Z`).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}` : ""}
                      </span>
                    </span>
                    {d.job_id ? (
                      <span className="shrink-0 text-sm font-bold text-ok-fg">✓ On the Jobs board</span>
                    ) : (
                      <button type="button" onClick={() => makeJob(d)} className="min-h-11 shrink-0 rounded-xl border border-ink px-3 text-sm font-bold">
                        Make it a job
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2">
              <DecisionForm people={members} onSave={(d) => change("decisions", "insert", { id: crypto.randomUUID(), meeting_id: next.id, decided_on: dayPlus(0), job_id: null, done_at: null, ...d })} />
            </div>
            <button type="button" onClick={held} className="mt-4 min-h-12 w-full rounded-xl border border-ink font-bold">
              We&apos;ve had the meeting
            </button>
          </Card>
        </>
      )}

      <RotaGrid />
      <JobStats showMine={false} />

      {past.length > 0 && (
        <Card>
          <h2 className="font-display text-xl">Past meetings</h2>
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {past.map((m) => {
              const ds = decisions.filter((d) => d.meeting_id === m.id);
              const came = (m.attendees ?? []).map((id) => nameOf(id).split(" ")[0]);
              return (
                <li key={m.id} className="py-2">
                  <details>
                    <summary className="min-h-12 cursor-pointer py-2">
                      <strong>{m.held_on ? dayLabel(m.held_on) : "No date"}</strong>
                      <span className="text-sm text-muted">
                        {" "}
                        · {nameOf(m.host_id)} hosted · {ds.length === 1 ? "1 decision" : `${ds.length} decisions`}
                      </span>
                    </summary>
                    {came.length > 0 && <p className="text-sm text-muted">There: {came.join(", ")}</p>}
                    {m.notes && <p className="whitespace-pre-line text-sm">{m.notes}</p>}
                    {ds.length > 0 && (
                      <ul className="mt-1 flex flex-col gap-1 text-sm">
                        {ds.map((d) => {
                          const s = decisionState(d, jobs, today());
                          return (
                            <li key={d.id}>
                              {s === "done" ? "✓ " : s === "late" ? "⚠ " : "• "}
                              {d.text}
                              {d.owner_id ? <span className="text-muted"> ({nameOf(d.owner_id)})</span> : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <button type="button" onClick={() => setSummaryFor(m)} className="mt-2 min-h-10 text-sm font-bold underline underline-offset-4">
                      Send the summary to {peter?.name.split(" ")[0] ?? "Peter"}
                    </button>
                  </details>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {summaryFor && (
        <BottomSheet title="Meeting summary" onClose={() => setSummaryFor(null)}>
          {(() => {
            const text = meetingSummary(summaryFor, decisions, (id) => nameOf(id), followed.filter((f) => f.meeting_id !== summaryFor.id));
            return (
              <div className="flex flex-col gap-3 pb-2">
                <h2 className="font-display text-2xl">Meeting saved</h2>
                <p className="text-sm text-muted">The next one is planned in 2 weeks. Send {peter?.name.split(" ")[0] ?? "Peter"} what was decided:</p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-base p-3 font-sans text-sm">{text}</pre>
                <a href={whatsappHref(peter?.phone, text) ?? `https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center rounded-xl bg-brand font-bold text-brand-contrast">
                  Send on WhatsApp
                </a>
              </div>
            );
          })()}
        </BottomSheet>
      )}

      <UndoBar state={undo} onClose={closeUndo} />
    </Screen>
  );
}
