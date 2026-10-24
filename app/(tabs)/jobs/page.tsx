"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { Empty, Screen } from "@/components/Screen";
import { PRESENCE, type Presence } from "@/components/Presence";
import { useSync } from "@/components/SyncProvider";
import { UndoBar, type UndoState } from "@/components/UndoBar";
import { JobAlerts } from "@/components/jobs/JobAlerts";
import { JobCard } from "@/components/jobs/JobCard";
import { JobForm } from "@/components/jobs/JobForm";
import { JobLibrary } from "@/components/jobs/JobLibrary";
import { fromTemplate, joinJob, postJob, updateJob, type NewJob } from "@/lib/jobs/actions";
import { findDuplicate, weekAhead } from "@/lib/jobs/board";
import type { Swap } from "@/lib/push/house";
import { supabase } from "@/lib/supabase/client";
import { sendAlertsNow } from "@/lib/push/client";
import { formatMinutes, jobStatus, learnedDuration, shareChoices, sortBoard, workers, type Job, type Participant } from "@/lib/jobs/logic";
import { contribution, suggestFor, type Person } from "@/lib/jobs/stats";
import { supperCount, type Diner } from "@/lib/home";
import type { StockItem } from "@/lib/shopping/shops";
import { TEMPLATES } from "@/lib/jobs/templates";
import { syncEngine } from "@/lib/sync/client";
import { useMe, useRows, type Member } from "@/lib/sync/hooks";
import type { Row } from "@/lib/sync/tables";

type Tab = "needs" | "progress" | "upcoming" | "done";
type Effort = "all" | "light" | "team";

const TABS: { id: Tab; label: string }[] = [
  { id: "needs", label: "Needs people" },
  { id: "progress", label: "In progress" },
  { id: "upcoming", label: "Upcoming & money" },
  { id: "done", label: "Done & Asante" },
];
const EFFORT: { id: Effort; label: string }[] = [
  { id: "all", label: "All jobs" },
  { id: "light", label: "🌿 Light only" },
  { id: "team", label: "💪 Team-ups" },
];
const TWO_WEEKS = 14 * 86400_000;

type Thanks = Row & { target_id: string; to_member: string; actor_id?: string | null; _local?: boolean };

export default function JobsPage() {
  const { syncNow } = useSync();
  const me = useMe();
  const jobs = (useRows<Job & { id: string }>("jobs") ?? []) as Job[];
  const parts = (useRows<Participant & { id: string }>("job_participants") ?? []) as Participant[];
  const members = (useRows<Member & { presence?: Presence }>("members") ?? []).sort((a, b) => a.sort - b.sort);
  const thanks = useRows<Thanks>("thanks") ?? [];
  const settings = useRows<Row & { volunteer_after_days?: number }>("settings") ?? [];
  const agendaAfter = settings[0]?.volunteer_after_days ?? 3;
  const tools = (useRows<StockItem>("stock_items") ?? []).filter((s) => s.track_mode === "tool");
  const diners = supperCount(members as unknown as Diner[]);
  const supper = `Cooking for ${diners.eating} tonight${diners.out.length ? ` (${diners.out.join(", ")} ${diners.out.length === 1 ? "is" : "are"} out)` : ""}`;
  // Suggest each open job to whoever at home has given least lately (joining stays voluntary).
  const stats = contribution(jobs, parts, members as Person[]);
  const suggestion = (j: Job) => suggestFor(j, parts, members as Person[], stats.lines, stats.enough);
  // Usual jobs follow how long they really take once there are 2 real times.
  const learned = (key: string) => learnedDuration(jobs, key);

  const [tab, setTab] = useState<Tab>("needs");
  // Home's "Say asante" opens the Done list.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "done") setTab("done");
  }, []);
  const [effort, setEffort] = useState<Effort>("all");
  const [adding, setAdding] = useState(false);
  const [library, setLibrary] = useState(false);
  const [start, setStart] = useState<string | undefined>(undefined);
  const [undo, setUndo] = useState<UndoState>(null);
  const closeUndo = useCallback(() => setUndo(null), []);
  const swaps = (useRows<Swap & { id: string }>("job_swaps") ?? []) as Swap[];
  const [dup, setDup] = useState<{ next: NewJob; existing: Job } | null>(null);
  const [swapping, setSwapping] = useState<Job | null>(null);
  const [doneAsk, setDoneAsk] = useState<string | null>(null);

  // From a reminder: /jobs?done=<id> asks "Finished?"; the alert's ✓ Done button adds &now=1.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get("done");
    if (!id) return;
    window.history.replaceState(null, "", "/jobs");
    if (q.get("now") === "1") {
      void updateJob(id, { done_at: new Date().toISOString(), done_by: me?.id ?? null }).then(() => {
        void syncNow();
        setUndo({ id: Date.now(), message: "Marked done. Asante!" });
      });
    } else setDoneAsk(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival from the alert
  }, []);

  // From a notification's buttons: "I'm on it" joins the job; "Accept" takes the swap.
  const [pending, setPending] = useState<{ join?: string; swap?: string } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const join = q.get("join") ?? undefined;
    const swap = q.get("accept") === "1" ? (q.get("swap") ?? undefined) : undefined;
    if (join || swap) {
      setPending({ join, swap });
      window.history.replaceState(null, "", "/jobs");
    }
  }, []);
  useEffect(() => {
    if (!pending || !me) return;
    if (pending.join) {
      const j = jobs.find((x) => x.id === pending.join);
      if (!j) return; // wait for the job to sync
      setPending(null);
      const pct = shareChoices(j, parts, me.id).suggested;
      void (pct ? joinJob(j.id, pct) : Promise.resolve("It's already covered.")).then((err) => {
        void syncNow();
        message(err ?? `You're on it: ${j.title}. Asante!`);
      });
    } else if (pending.swap) {
      setPending(null);
      void supabase()
        .rpc("accept_swap", { p_swap: pending.swap })
        .then(({ error }) => {
          void syncNow();
          message(error ? (error.message.includes("fetch") ? "Accepting a swap needs signal." : error.message) : "Swapped. Asante!");
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the job or me arrives
  }, [pending, me, jobs]);

  const nameOf = (id: string | null | undefined) => members.find((m) => m.id === id)?.name ?? "Someone";
  const thanked = (jobId: string, to: string) => thanks.some((t) => t.target_id === jobId && t.to_member === to && (t.actor_id === me?.id || (t._local && !t.actor_id)));
  const message = (text: string, undoFn?: () => void) => setUndo({ id: Date.now(), message: text, undo: undoFn });

  const now = Date.now();
  const inTab = useMemo(() => {
    const live = jobs.filter((j) => !j.deleted_at);
    const pick = (t: Tab) =>
      live.filter((j) => {
        const s = jobStatus(j, parts, now);
        if (t === "needs") return s === "open" || s === "partial" || s === "overdue";
        if (t === "progress") return s === "taken";
        if (t === "upcoming") return s === "planning";
        return s === "done" && now - Date.parse(j.done_at!) < TWO_WEEKS;
      });
    return Object.fromEntries(TABS.map((t) => [t.id, pick(t.id)])) as Record<Tab, Job[]>;
    // `now` changes every render; the lists only need to follow the data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, parts]);

  const shown = (tab === "done" ? [...inTab.done].sort((a, b) => b.done_at!.localeCompare(a.done_at!)) : sortBoard(inTab[tab], parts, now)).filter(
    (j) => effort === "all" || (effort === "light" ? j.strain === "light" : j.people_needed > 1),
  );

  async function post(job: NewJob, anyway = false) {
    // Already on the board? Offer that one instead of a second copy.
    const existing = anyway ? undefined : findDuplicate(job, jobs);
    if (existing) {
      setAdding(false);
      return setDup({ next: job, existing });
    }
    const id = await postJob(job);
    // Urgent jobs ("Water is back!") alert everyone at home now, not at the next 5-minute round.
    void syncNow().then((r) => {
      if (r?.ok && job.urgent) void sendAlertsNow();
    });
    setAdding(false);
    setTab(job.requires_funds ? "upcoming" : "needs");
    message(`Posted: ${job.title}`, async () => {
      await syncEngine().queue("jobs", "delete", { id });
      void syncNow();
    });
  }

  const home = members.filter((m) => m.presence === "at_home" && m.id !== me?.id).map((m) => m.name);

  return (
    <Screen title="Jobs" tone="monarch">
      <JobAlerts />

      {(() => {
        const j = doneAsk ? jobs.find((x) => x.id === doneAsk && !x.done_at) : undefined;
        return j ? (
          <section className="rounded-2xl border border-line bg-raised p-5 lg:[column-span:all]">
            <p className="eyebrow eyebrow-accent">From your reminder</p>
            <p className="font-display text-2xl">Finished “{j.title}”?</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() =>
                  void updateJob(j.id, { done_at: new Date().toISOString(), done_by: me?.id ?? null }).then(() => {
                    void syncNow();
                    setDoneAsk(null);
                    message(`${j.title}: done. Asante!`);
                  })
                }
                className="min-h-12 flex-1 rounded-xl bg-brand font-bold text-brand-contrast"
              >
                ✓ Done
              </button>
              <button type="button" onClick={() => setDoneAsk(null)} className="min-h-12 rounded-xl px-4 font-bold">
                Not yet
              </button>
            </div>
          </section>
        ) : null;
      })()}

      {/* Swaps asked of me, and mine waiting for an answer. */}
      {swaps
        .filter((s) => !s.deleted_at && s.status === "open" && (s.to_member === me?.id || s.actor_id === me?.id))
        .map((s) => {
          const job = jobs.find((j) => j.id === s.job_id);
          const offer = jobs.find((j) => j.id === s.offer_job_id);
          if (!job || job.done_at) return null;
          const forMe = s.to_member === me?.id;
          return (
            <section key={s.id} className="rounded-2xl border border-line bg-raised p-5 lg:[column-span:all]">
              <p className="eyebrow eyebrow-accent">{forMe ? "Swap asked of you" : "Your swap"}</p>
              <p className="font-display text-xl">
                {forMe ? `${nameOf(s.actor_id)} asks you to take “${job.title}”` : `Waiting for ${nameOf(s.to_member)} to take “${job.title}”`}
              </p>
              {offer && <p className="text-sm">{forMe ? `In return, ${nameOf(s.actor_id)} takes your “${offer.title}”.` : `You'd take their “${offer.title}”.`}</p>}
              {s.note && <p className="text-sm text-muted">“{s.note}”</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {forMe ? (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        const { error } = await supabase().rpc("accept_swap", { p_swap: s.id });
                        if (error) return message(error.message.includes("fetch") ? "Accepting a swap needs signal." : error.message);
                        void syncNow();
                        message(`Swapped. “${job.title}” is yours now. Asante!`);
                      }}
                      className="min-h-12 rounded-xl bg-brand px-5 font-bold text-brand-contrast"
                    >
                      Accept the swap
                    </button>
                    <button type="button" onClick={() => syncEngine().queue("job_swaps", "update", { id: s.id, status: "declined" }).then(() => (void syncNow(), message("Said no, kindly.")))} className="min-h-12 rounded-xl border border-line px-4 font-bold">
                      Not this time
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => syncEngine().queue("job_swaps", "update", { id: s.id, status: "cancelled" }).then(() => (void syncNow(), message("Swap cancelled")))} className="min-h-10 text-sm font-bold text-muted underline underline-offset-4">
                    Cancel the swap
                  </button>
                )}
              </div>
            </section>
          );
        })}

      <section aria-labelledby="quick" className="flex flex-col gap-2 lg:[column-span:all]">
        <h2 id="quick" className="font-bold">
          What needs doing right now?
        </h2>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
          {TEMPLATES.filter((t) => t.chip).map((t) => (
            <button key={t.id} type="button" onClick={() => post(fromTemplate(t, Date.now(), learned(t.id)?.minutes))} className="min-h-12 shrink-0 rounded-md border border-brand bg-raised px-4 text-sm font-bold text-brand">
              {t.chip}
            </button>
          ))}
          <button type="button" onClick={() => setLibrary(true)} className="min-h-12 shrink-0 rounded-md border border-ink bg-raised px-4 text-sm font-bold">
            📚 Job library ({TEMPLATES.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setStart(undefined);
              setAdding(true);
            }}
            className="min-h-12 shrink-0 rounded-md bg-brand px-4 text-sm font-bold text-brand-contrast"
          >
            + Add a job
          </button>
        </div>
        {home.length > 0 && (
          <p className="text-sm text-muted">
            <span aria-hidden="true">{PRESENCE.at_home.icon} </span>
            At home now: {home.join(", ")}
          </p>
        )}
      </section>

      {adding && <JobForm key={start ?? "new"} start={start} onPost={post} onCancel={() => setAdding(false)} learned={learned} />}
      {library && (
        <JobLibrary
          learned={learned}
          onClose={() => setLibrary(false)}
          onPick={(t) => {
            setStart(t.id);
            setAdding(true);
            setLibrary(false);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      )}

      <div role="tablist" aria-label="Jobs" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-12 shrink-0 rounded-md border px-4 text-sm font-bold ${tab === t.id ? "border-brand bg-brand text-brand-contrast" : "border-line bg-raised"}`}
          >
            {t.label} ({inTab[t.id].length})
          </button>
        ))}
      </div>
      <div role="group" aria-label="Effort" className="flex flex-wrap gap-2">
        {EFFORT.map((e) => (
          <button key={e.id} type="button" aria-pressed={effort === e.id} onClick={() => setEffort(e.id)} className={`min-h-10 rounded-md border px-3 text-sm font-bold ${effort === e.id ? "border-brand text-brand" : "border-line"}`}>
            {e.label}
          </button>
        ))}
      </div>

      {shown.length ? (
        <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
          {shown.map((j) => (
            <JobCard key={j.id} job={j} parts={parts} meId={me?.id} nameOf={nameOf} thanked={thanked} onMessage={message} homeNames={home} agendaAfter={agendaAfter} suggestedFor={suggestion(j)} tools={tools} supper={supper} onSwap={setSwapping} />
          ))}
        </ul>
      ) : (
        <Empty>
          {tab === "needs" ? "Nothing open. The house is sorted." : tab === "progress" ? "Nobody is on a job right now." : tab === "upcoming" ? "No money runs planned." : "Nothing finished in the last 2 weeks yet."}
        </Empty>
      )}

      {/* Laptop: the week ahead, for sharing jobs out at the family meeting. */}
      <section aria-labelledby="week" className="hidden rounded-2xl border border-line bg-raised p-6 lg:block lg:[column-span:all]">
        <h2 id="week" className="font-display text-2xl">
          The week ahead
        </h2>
        <div className="mt-4 grid grid-cols-7 gap-3">
          {weekAhead(jobs, parts, new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)).map((d, i) => (
            <div key={d.day} className="flex min-h-40 flex-col gap-2 rounded-xl bg-base p-3">
              <p className="flex items-baseline justify-between gap-1">
                <span className="font-bold">{i === 0 ? "Today" : new Date(`${d.day}T09:00:00Z`).toLocaleDateString("en-KE", { weekday: "short", day: "numeric" })}</span>
                <span className="text-xs text-muted tabular">{d.minutes ? formatMinutes(d.minutes) : ""}</span>
              </p>
              {d.jobs.map(({ job, people }) => (
                <div key={job.id} className="rounded-lg bg-raised p-2 text-xs">
                  <p className="leading-snug">{job.title}</p>
                  <p className={`mt-1 ${people.length ? "text-muted" : "font-bold text-action-text"}`}>{people.length ? people.map((p) => nameOf(p)).join(", ") : "Nobody yet"}</p>
                </div>
              ))}
              {!d.jobs.length && <p className="text-xs text-muted">Nothing planned</p>}
            </div>
          ))}
        </div>
      </section>

      {dup && (
        <BottomSheet title="Already on the board" onClose={() => setDup(null)}>
          <div className="flex flex-col gap-3 pb-2">
            <h2 className="font-display text-2xl">Already on the board</h2>
            <p>
              “{dup.existing.title}” is open{workers(dup.existing.id, parts).length ? `, with ${workers(dup.existing.id, parts).map((w) => nameOf(w.member_id)).join(", ")} on it` : " and nobody is on it yet"}.
            </p>
            <button
              type="button"
              onClick={() => {
                const s = jobStatus(dup.existing, parts, Date.now());
                setTab(s === "taken" ? "progress" : s === "planning" ? "upcoming" : "needs");
                setDup(null);
                message("It's on the board below. Tap it to join.");
              }}
              className="min-h-12 rounded-xl bg-brand font-bold text-brand-contrast"
            >
              Show me that one
            </button>
            <button
              type="button"
              onClick={() => {
                const next = dup.next;
                setDup(null);
                void post(next, true);
              }}
              className="min-h-12 rounded-xl border border-line font-bold"
            >
              Post another one anyway
            </button>
          </div>
        </BottomSheet>
      )}

      {swapping && (
        <SwapSheet
          job={swapping}
          meId={me?.id}
          people={members.filter((m) => m.id !== me?.id && m.active !== false && !m.is_remote)}
          theirJobs={(id) => jobs.filter((j) => !j.done_at && !j.deleted_at && workers(j.id, parts).some((w) => w.member_id === id))}
          onClose={() => setSwapping(null)}
          onAsk={async (to, offer, note) => {
            await syncEngine().queue("job_swaps", "insert", { id: crypto.randomUUID(), job_id: swapping.id, to_member: to, offer_job_id: offer, note: note || null, status: "open" });
            void syncNow().then(() => void sendAlertsNow());
            setSwapping(null);
            message(`Asked ${nameOf(to)}. You stay on it until they accept.`);
          }}
        />
      )}

      <UndoBar state={undo} onClose={closeUndo} />
    </Screen>
  );
}

function SwapSheet({
  job,
  people,
  theirJobs,
  onClose,
  onAsk,
}: {
  job: Job;
  meId?: string;
  people: (Member & { presence?: Presence })[];
  theirJobs: (memberId: string) => Job[];
  onClose: () => void;
  onAsk: (to: string, offer: string | null, note: string) => void;
}) {
  const [to, setTo] = useState<string>("");
  const [offer, setOffer] = useState<string>("");
  const [note, setNote] = useState("");
  const theirs = to ? theirJobs(to) : [];
  return (
    <BottomSheet title="Swap this job" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (to) onAsk(to, offer || null, note.trim());
        }}
        className="flex flex-col gap-3 pb-2"
      >
        <h2 className="font-display text-2xl">Swap “{job.title}”</h2>
        <p className="text-sm text-muted">They get a message. You stay on it until they accept.</p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold">Ask</legend>
          {people.map((p) => (
            <label key={p.id} className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 ${to === p.id ? "border-ink" : "border-line"}`}>
              <span>
                {p.name}
                {p.presence && p.presence !== "at_home" ? <span className="text-sm text-muted"> · {PRESENCE[p.presence]?.word ?? "away"}</span> : null}
              </span>
              <input
                type="radio"
                name="swap-to"
                checked={to === p.id}
                onChange={() => {
                  setTo(p.id);
                  setOffer("");
                }}
                className="size-5 accent-[var(--action)]"
              />
            </label>
          ))}
        </fieldset>
        {theirs.length > 0 && (
          <label className="flex flex-col gap-1 text-sm font-bold">
            In return I&apos;ll take (optional)
            <select value={offer} onChange={(e) => setOffer(e.target.value)} className="min-h-12 rounded-xl border border-line bg-raised px-3 font-normal">
              <option value="">Nothing, just asking</option>
              {theirs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm font-bold">
          Note (optional)
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I have an exam tomorrow" className="min-h-12 rounded-xl border border-line bg-raised px-3 font-normal" />
        </label>
        <button type="submit" disabled={!to} className="min-h-12 rounded-xl bg-brand font-bold text-brand-contrast disabled:opacity-50">
          Ask to swap
        </button>
      </form>
    </BottomSheet>
  );
}
