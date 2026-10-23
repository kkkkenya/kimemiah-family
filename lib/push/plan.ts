// Which push alerts to send right now. Pure, so the rules are tested without a phone:
// quiet hours 21:00-07:00 Nairobi, nothing older than an hour, never the person who did it,
// people who are out or away don't get reminders, and alerts never mention money.

import { formatMinutes, jobStatus, workers, type Job, type Participant } from "@/lib/jobs/logic";
import { contribution, easing, suggestFor, suitableFor, type Person } from "@/lib/jobs/stats";

export type PushMember = Person & { ease_offered_at?: string | null; nudged_at?: string | null };
export type PushJob = Job & {
  actor_id?: string | null;
  urgent_notified_at?: string | null;
  covered_notified_at?: string | null;
  overdue_notified_at?: string | null;
  suggested_notified_at?: string | null;
  funds_notified_at?: string | null;
};
export type PushPart = Participant & { last_reminded_at?: string | null; handover_notified_at?: string | null; updated_at?: string };

export type Alert = {
  kind: "urgent" | "covered" | "overdue" | "reminder" | "handover" | "suggested" | "nudge" | "ease" | "funds";
  jobId?: string;
  partId?: string; // for reminders and handovers: the participant row it's about
  memberId?: string; // for nudge and ease: the person it's about (marked once a week)
  key?: string; // money alerts: recorded once in money_alerts
  url?: string;
  to: string[]; // member ids (empty: just mark it handled, e.g. too old to send)
  title: string;
  body: string;
};

const HOUR = 3600_000;
const nairobiHour = (t: number) => new Date(t + 3 * HOUR).getUTCHours();
export const isQuiet = (now: number) => nairobiHour(now) < 7 || nairobiHour(now) >= 21;

/**
 * `jobs` are the open ones; `history` adds jobs finished in the last 14 days, used to compare
 * how much each person has given (for suggestions and the weekly how-you're-doing alerts).
 */
export function planAlerts(jobs: PushJob[], parts: PushPart[], members: PushMember[], now = Date.now(), history: PushJob[] = []): Alert[] {
  if (isQuiet(now)) return [];
  const stats = contribution([...jobs, ...history], parts, members, now);
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

    // A new job nobody has taken: suggest it to whoever at home has given least lately.
    if (!job.urgent && !job.suggested_notified_at && !people.length && status === "open") {
      const who = fresh(job.created_at) ? suggestFor(job, parts, members, stats.lines, stats.enough, now) : null;
      alerts.push({
        kind: "suggested",
        jobId: job.id,
        to: who && who !== job.actor_id ? [who] : [],
        title: `Suggested for you: ${job.title}`,
        body: `About ${formatMinutes(job.duration_min)}. Join if you can; it's up to you.`,
      });
    }

    // Money came in for a run (or a project reached its target): tell the people going.
    if (job.funds_status === "funds_ready" && job.requires_funds && !job.funds_notified_at) {
      alerts.push({
        kind: "funds",
        jobId: job.id,
        to: ids,
        title: `Money is ready: ${job.title}`,
        body: people.length ? "You can go ahead." : "Who's going? Join it on Jobs.",
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
  // Once a week at most: how you're doing, as an offer, never an order.
  const WEEK = 7 * 24 * HOUR;
  const due = (iso?: string | null) => !iso || now - Date.parse(iso) >= WEEK;
  if (stats.enough) {
    for (const line of stats.lines) {
      const m = members.find((p) => p.id === line.memberId);
      if (!m || (m.presence ?? "at_home") !== "at_home" || easing(m, now)) continue;
      if (line.band === "lot" && due(m.ease_offered_at)) {
        alerts.push({
          kind: "ease",
          memberId: m.id,
          to: [m.id],
          url: "/",
          title: "Thank you for all you've done",
          body: `${formatMinutes(line.minutes)} for the house in 2 weeks, more than an equal share. Want to take it easy this week? Tap to choose.`,
        });
      }
      if (line.band === "room" && due(m.nudged_at)) {
        const fits = suitableFor(jobs, parts, m, now);
        if (fits.length) {
          alerts.push({
            kind: "nudge",
            memberId: m.id,
            to: [m.id],
            title: fits.length === 1 ? "A job that suits you" : `${fits.length} jobs that suit you`,
            body: `${fits.slice(0, 2).map((j) => j.title).join(", ")}. Joining is up to you.`,
          });
        }
      }
    }
  }
  return alerts;
}

/** One notification per person: several alerts at once become one summary. */
export function groupByPerson(alerts: Alert[]): Map<string, { title: string; body: string; tag: string; url: string }> {
  const per = new Map<string, Alert[]>();
  for (const a of alerts) for (const m of a.to) per.set(m, [...(per.get(m) ?? []), a]);
  const out = new Map<string, { title: string; body: string; tag: string; url: string }>();
  for (const [m, list] of per) {
    out.set(
      m,
      list.length === 1
        ? { title: list[0].title, body: list[0].body, tag: `${list[0].kind}-${list[0].key ?? list[0].jobId ?? list[0].memberId}`, url: list[0].url ?? "/jobs" }
        : { title: list.some((a) => a.key) ? `${list.length} updates from the house` : `${list.length} job updates`, body: list.map((a) => a.title).join(" · "), tag: "jobs", url: list.every((a) => a.key) ? "/money" : "/jobs" },
    );
  }
  return out;
}
