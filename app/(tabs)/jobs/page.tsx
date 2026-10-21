"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Empty, Screen } from "@/components/Screen";
import { PRESENCE, type Presence } from "@/components/Presence";
import { useSync } from "@/components/SyncProvider";
import { UndoBar, type UndoState } from "@/components/UndoBar";
import { JobAlerts } from "@/components/jobs/JobAlerts";
import { JobCard } from "@/components/jobs/JobCard";
import { JobForm } from "@/components/jobs/JobForm";
import { fromTemplate, postJob, type NewJob } from "@/lib/jobs/actions";
import { sendAlertsNow } from "@/lib/push/client";
import { jobStatus, learnedDuration, sortBoard, type Job, type Participant } from "@/lib/jobs/logic";
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
  const [undo, setUndo] = useState<UndoState>(null);
  const closeUndo = useCallback(() => setUndo(null), []);

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

  async function post(job: NewJob) {
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
    <Screen title="Jobs">
      <JobAlerts />

      <section aria-labelledby="quick" className="flex flex-col gap-2">
        <h2 id="quick" className="font-bold">
          What needs doing right now?
        </h2>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {TEMPLATES.filter((t) => t.chip).map((t) => (
            <button key={t.id} type="button" onClick={() => post(fromTemplate(t, Date.now(), learned(t.id)?.minutes))} className="min-h-12 shrink-0 rounded-full border border-brand bg-raised px-4 text-sm font-bold text-brand">
              {t.chip}
            </button>
          ))}
          <button type="button" onClick={() => setAdding(true)} className="min-h-12 shrink-0 rounded-full bg-brand px-4 text-sm font-bold text-brand-contrast">
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

      {adding && <JobForm onPost={post} onCancel={() => setAdding(false)} learned={learned} />}

      <div role="tablist" aria-label="Jobs" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-12 shrink-0 rounded-full border px-4 text-sm font-bold ${tab === t.id ? "border-brand bg-brand text-brand-contrast" : "border-line bg-raised"}`}
          >
            {t.label} ({inTab[t.id].length})
          </button>
        ))}
      </div>
      <div role="group" aria-label="Effort" className="flex flex-wrap gap-2">
        {EFFORT.map((e) => (
          <button key={e.id} type="button" aria-pressed={effort === e.id} onClick={() => setEffort(e.id)} className={`min-h-10 rounded-full border px-3 text-sm font-bold ${effort === e.id ? "border-brand text-brand" : "border-line"}`}>
            {e.label}
          </button>
        ))}
      </div>

      {shown.length ? (
        <ul className="flex flex-col gap-3">
          {shown.map((j) => (
            <JobCard key={j.id} job={j} parts={parts} meId={me?.id} nameOf={nameOf} thanked={thanked} onMessage={message} homeNames={home} agendaAfter={agendaAfter} suggestedFor={suggestion(j)} tools={tools} supper={supper} />
          ))}
        </ul>
      ) : (
        <Empty>
          {tab === "needs" ? "Nothing open. The house is sorted." : tab === "progress" ? "Nobody is on a job right now." : tab === "upcoming" ? "No money runs planned." : "Nothing finished in the last 2 weeks yet."}
        </Empty>
      )}

      <UndoBar state={undo} onClose={closeUndo} />
    </Screen>
  );
}
