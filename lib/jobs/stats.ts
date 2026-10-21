// How much each person gives to the house, compared with an equal share, and who to suggest
// for a job. Joining stays voluntary: this only suggests and nudges.

import { jobStatus, shareChoices, shareMinutes, workers, type Job, type Participant } from "./logic";

export type Person = {
  id: string;
  name: string;
  sort: number;
  active?: boolean;
  is_remote?: boolean;
  presence?: string | null;
  no_heavy?: boolean;
  ease_until?: string | null;
};

/** new: too little done yet to judge; away: not counted while away. */
export type Band = "new" | "away" | "room" | "fair" | "lot";

export const BAND: Record<Band, { word: string; cls: string }> = {
  new: { word: "Just starting", cls: "border border-line" },
  away: { word: "Away", cls: "border border-line" },
  room: { word: "Room to help", cls: "bg-low-bg text-low-fg" },
  fair: { word: "Doing your part", cls: "bg-ok-bg text-ok-fg" },
  lot: { word: "Doing a lot", cls: "bg-brand text-brand-contrast" },
};

export type Line = { memberId: string; jobsDone: number; minutes: number; rescues: number; cooked: number; ratio: number | null; band: Band };

const DAY = 86400_000;
const ENOUGH_MINUTES = 120; // the house needs 2 h of finished work before anyone is compared

/** People who live at home (Peter, who lives away, is never counted), in family order. */
export const household = (people: Person[]) => people.filter((p) => p.active !== false && !p.is_remote).sort((a, b) => a.sort - b.sort);

export function contribution(jobs: Job[], parts: Participant[], people: Person[], now = Date.now(), days = 14) {
  const since = now - days * DAY;
  const done = new Map(jobs.filter((j) => j.done_at && !j.deleted_at && Date.parse(j.done_at) >= since).map((j) => [j.id, j]));
  const home = household(people);
  const lines: Line[] = home.map((p) => ({ memberId: p.id, jobsDone: 0, minutes: 0, rescues: 0, cooked: 0, ratio: null, band: "new" as Band }));
  const byId = new Map(lines.map((l) => [l.memberId, l]));

  for (const p of parts) {
    const job = done.get(p.job_id);
    const l = byId.get(p.member_id);
    if (!job || !l || p.deleted_at || p.status === "unable") continue;
    l.jobsDone++;
    l.minutes += shareMinutes(job, Number(p.effort_pct));
    if (p.status === "rescuer") l.rescues++;
    if (job.category === "cooking_house") l.cooked++;
  }

  const counted = home.filter((p) => p.presence !== "away");
  const houseMinutes = lines.reduce((s, l) => s + l.minutes, 0);
  const fair = counted.length ? houseMinutes / counted.length : 0;
  const enough = houseMinutes >= ENOUGH_MINUTES;
  for (const l of lines) {
    const person = home.find((p) => p.id === l.memberId)!;
    if (person.presence === "away") l.band = "away";
    else if (enough) {
      l.ratio = l.minutes / fair;
      l.band = l.ratio < 0.5 ? "room" : l.ratio > 1.6 ? "lot" : "fair";
    }
  }
  const rescued = [...done.values()].filter((j) => parts.some((p) => p.job_id === j.id && !p.deleted_at && p.status === "rescuer")).length;
  return { lines, houseMinutes, fair, enough, jobsDone: done.size, rescued };
}

export const easing = (p: Person | undefined, now = Date.now()) => !!p?.ease_until && Date.parse(p.ease_until) > now;

/** Can this person sensibly take this job right now? (At home, not easing off, not heavy if they said no heavy, room left.) */
export function suits(job: Job, parts: Participant[], p: Person, now = Date.now()): boolean {
  if (job.done_at || job.deleted_at || p.is_remote || (p.presence ?? "at_home") !== "at_home" || easing(p, now)) return false;
  if (job.strain === "heavy" && p.no_heavy) return false;
  const s = jobStatus(job, parts, now);
  if (s !== "open" && s !== "partial" && s !== "overdue") return false;
  if (workers(job.id, parts).some((w) => w.member_id === p.id)) return false;
  return shareChoices(job, parts, p.id).choices.length > 0;
}

/**
 * Who to suggest for a job: of the people it suits, whoever has given least lately.
 * None until there's enough history to compare, and none when the top two are level.
 */
export function suggestFor(job: Job, parts: Participant[], people: Person[], lines: Line[], enough: boolean, now = Date.now()): string | null {
  if (!enough) return null;
  const minutes = (id: string) => lines.find((l) => l.memberId === id)?.minutes ?? 0;
  const ranked = household(people)
    .filter((p) => suits(job, parts, p, now))
    .sort((a, b) => minutes(a.id) - minutes(b.id));
  if (!ranked.length) return null;
  if (ranked.length > 1 && minutes(ranked[0].id) === minutes(ranked[1].id)) return null;
  return ranked[0].id;
}

/** Open jobs that suit me, soonest due first (for "jobs that suit you"). */
export function suitableFor(jobs: Job[], parts: Participant[], me: Person, now = Date.now()): Job[] {
  return jobs
    .filter((j) => suits(j, parts, me, now))
    .sort((a, b) => (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity));
}
