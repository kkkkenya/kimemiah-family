// Which push alerts to send right now. Pure, so the rules are tested without a phone:
// quiet hours 21:00-07:00 Nairobi, nothing older than an hour, never the person who did it,
// people who are out or away don't get reminders, and alerts never mention money.

import { jobStatus, workers, type Job, type Participant } from "@/lib/jobs/logic";

export type PushMember = { id: string; name: string; presence?: string | null; is_remote?: boolean };
export type PushJob = Job & {
  actor_id?: string | null;
  urgent_notified_at?: string | null;
  covered_notified_at?: string | null;
  overdue_notified_at?: string | null;
};
export type PushPart = Participant & { last_reminded_at?: string | null; handover_notified_at?: string | null; updated_at?: string };

export type Alert = {
  kind: "urgent" | "covered" | "overdue" | "reminder" | "handover";
  jobId: string;
  partId?: string; // for reminders and handovers: the participant row it's about
  to: string[]; // member ids (empty: just mark it handled, e.g. too old to send)
  title: string;
  body: string;
};

const HOUR = 3600_000;
const nairobiHour = (t: number) => new Date(t + 3 * HOUR).getUTCHours();
export const isQuiet = (now: number) => nairobiHour(now) < 7 || nairobiHour(now) >= 21;

export function planAlerts(jobs: PushJob[], parts: PushPart[], members: PushMember[], now = Date.now()): Alert[] {
  if (isQuiet(now)) return [];
  const name = (id?: string | null) => members.find((m) => m.id === id)?.name ?? "Someone";
  const atHome = (except: (string | null | undefined)[]) =>
    members.filter((m) => !m.is_remote && (m.presence ?? "at_home") === "at_home" && !except.includes(m.id)).map((m) => m.id);
  const alerts: Alert[] = [];

  for (const job of jobs) {
    if (job.deleted_at || job.done_at) continue;
    const people = workers(job.id, parts);
    const ids = people.map((p) => p.member_id);
    const status = jobStatus(job, parts, now);
    const fresh = (iso?: string | null) => !!iso && now - Date.parse(iso) <= HOUR;

    // "Water is back!" and other urgent jobs: everyone at home except whoever posted it.
    if (job.urgent && !job.urgent_notified_at) {
      alerts.push({
        kind: "urgent",
        jobId: job.id,
        to: fresh(job.created_at) ? atHome([job.actor_id, ...ids]) : [],
        title: job.title,
        body: `${name(job.actor_id)} posted this. Can you help?`,
      });
    }

    // A team job just got fully covered: tell the people already on it.
    if (status === "taken" && people.length > 1 && !job.covered_notified_at) {
      const last = [...people].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
      alerts.push({
        kind: "covered",
        jobId: job.id,
        to: fresh(last.created_at) ? ids.filter((id) => id !== last.member_id) : [],
        title: `${job.title}: you're covered`,
        body: `${name(last.member_id)} joined. Everyone's share adds up to 100%.`,
      });
    }

    // Past due and not finished: tell the people on it once, before the house sees the rescue banner.
    if (status === "overdue" && !job.overdue_notified_at) {
      alerts.push({
        kind: "overdue",
        jobId: job.id,
        to: ids,
        title: `${job.title} is past its time`,
        body: "Tap Done if it's finished, or ask someone to help.",
      });
    }

    // Every 2 hours while you're on it and at home.
    if (status !== "overdue") {
      for (const p of people as PushPart[]) {
        const since = Date.parse(p.last_reminded_at ?? p.created_at ?? "") || now;
        const home = (members.find((m) => m.id === p.member_id)?.presence ?? "at_home") === "at_home";
        if (home && now - since >= 2 * HOUR) {
          alerts.push({
            kind: "reminder",
            jobId: job.id,
            partId: p.id,
            to: [p.member_id],
            title: `Still yours: ${job.title}`,
            body: `Your ${p.effort_pct}% share. Tap Done if it's finished, or ask someone to team up.`,
          });
        }
      }
    }
  }

  // Someone stepped off a job that isn't done: offer it to whoever's at home.
  for (const p of parts) {
    if (!p.deleted_at || p.handover_notified_at || p.status === "unable") continue;
    const job = jobs.find((j) => j.id === p.job_id);
    if (!job || job.done_at || job.deleted_at) continue;
    const recent = now - Date.parse(p.deleted_at) <= HOUR;
    alerts.push({
      kind: "handover",
      jobId: job.id,
      partId: p.id,
      to: recent ? atHome([p.member_id, ...workers(job.id, parts).map((w) => w.member_id)]) : [],
      title: `${job.title} needs someone`,
      body: `${name(p.member_id)} handed over their ${p.effort_pct}%. Can you take it?`,
    });
  }
  return alerts;
}

/** One notification per person: several alerts at once become one summary. */
export function groupByPerson(alerts: Alert[]): Map<string, { title: string; body: string; tag: string }> {
  const per = new Map<string, Alert[]>();
  for (const a of alerts) for (const m of a.to) per.set(m, [...(per.get(m) ?? []), a]);
  const out = new Map<string, { title: string; body: string; tag: string }>();
  for (const [m, list] of per) {
    out.set(
      m,
      list.length === 1
        ? { title: list[0].title, body: list[0].body, tag: `${list[0].kind}-${list[0].jobId}` }
        : { title: `${list.length} job updates`, body: list.map((a) => a.title).join(" · "), tag: "jobs" },
    );
  }
  return out;
}
