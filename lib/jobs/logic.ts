// Jobs logic: status, size (time x people), shares, reminders and the meeting summary.
// Pure functions over this phone's copy, so the board is right with no signal.

export type Strain = "light" | "medium" | "heavy";
export type FundsStatus = "not_needed" | "discussing" | "funds_ready" | "paid_by_dad";

export type Job = {
  id: string;
  title: string;
  notes?: string | null;
  category: string;
  strain: Strain;
  duration_min: number;
  people_needed: number;
  urgent?: boolean;
  due_at?: string | null;
  repeat?: string;
  requires_funds?: boolean;
  estimated_cost_kes?: number | null;
  funds_status?: FundsStatus;
  planned_for?: string | null;
  parent_job_id?: string | null;
  next_stage?: unknown;
  done_at?: string | null;
  done_by?: string | null;
  started_at?: string | null;
  template_key?: string | null;
  rota_date?: string | null;
  source_item_id?: string | null;
  created_at?: string;
  deleted_at?: string | null;
};

export type Participant = {
  id: string;
  job_id: string;
  member_id: string;
  effort_pct: number;
  role_note?: string | null;
  status: "active" | "rescuer" | "unable";
  created_at?: string;
  deleted_at?: string | null;
};

export type Status = "done" | "planning" | "overdue" | "taken" | "partial" | "open";

const num = (n: unknown) => Number(n ?? 0);

/** People currently doing the job (not those who stepped back or left). */
export const workers = (jobId: string, parts: Participant[]) =>
  parts.filter((p) => p.job_id === jobId && !p.deleted_at && p.status !== "unable");

export const coverage = (jobId: string, parts: Participant[]) => workers(jobId, parts).reduce((s, p) => s + num(p.effort_pct), 0);

const nairobiDate = (t: number) => new Date(t + 3 * 3600_000).toISOString().slice(0, 10);

/** Funded jobs wait in "Upcoming" until the money is ready and their day comes. */
export function isUpcoming(job: Job, now = Date.now()): boolean {
  if (!job.requires_funds || job.done_at) return false;
  const waitingForMoney = job.funds_status === "discussing";
  const notYet = !!job.planned_for && job.planned_for > nairobiDate(now);
  return waitingForMoney || notYet;
}

export function jobStatus(job: Job, parts: Participant[], now = Date.now()): Status {
  if (job.done_at) return "done";
  if (isUpcoming(job, now)) return "planning";
  const people = workers(job.id, parts);
  const late = !!job.due_at && Date.parse(job.due_at) < now;
  if (people.length && late) return "overdue";
  if (coverage(job.id, parts) >= 100 && people.length >= num(job.people_needed)) return "taken";
  return people.length ? "partial" : "open";
}

// ---------------------------------------------------------------- size: time x people

export type Size = { personMinutes: number; label: "Quick" | "Small" | "Medium" | "Big" };

/** A job's size is how much work it is: how long it takes times how many people it needs. */
export function jobSize(job: Pick<Job, "duration_min" | "people_needed">): Size {
  const personMinutes = num(job.duration_min) * Math.max(1, num(job.people_needed));
  const label = personMinutes <= 30 ? "Quick" : personMinutes <= 90 ? "Small" : personMinutes < 240 ? "Medium" : "Big";
  return { personMinutes, label };
}

/** The work in a share: 40% of a 1 h job for 2 people is 48 minutes. */
export const shareMinutes = (job: Pick<Job, "duration_min" | "people_needed">, pct: number) =>
  Math.round((jobSize(job).personMinutes * pct) / 100);

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const SHARES = [20, 25, 30, 40, 50, 60, 70, 75, 80, 100] as const;

/**
 * Shares I can pick, and the default: what's left, split across the people still needed,
 * keeping at least 20% for each of them so a team job never fills up with one person.
 */
export function shareChoices(job: Job, parts: Participant[], meId?: string): { choices: number[]; suggested: number } {
  const others = workers(job.id, parts).filter((p) => p.member_id !== meId);
  const left = 100 - others.reduce((s, p) => s + num(p.effort_pct), 0);
  const stillNeeded = Math.max(1, num(job.people_needed) - others.length); // including me
  const max = left - 20 * (stillNeeded - 1);
  const choices = SHARES.filter((s) => s <= max);
  if (!choices.length) return { choices: [], suggested: 0 };
  const fair = left / stillNeeded;
  const suggested = choices.reduce((a, b) => (Math.abs(b - fair) < Math.abs(a - fair) ? b : a));
  return { choices, suggested };
}

// ---------------------------------------------------------------- board order

const RANK: Record<Status, number> = { overdue: 0, partial: 2, open: 3, taken: 4, planning: 5, done: 6 };

/** Overdue rescues first, then urgent jobs, then team-ups waiting for people, then open jobs; soonest due first. */
export function sortBoard(jobs: Job[], parts: Participant[], now = Date.now()): Job[] {
  const rank = (j: Job) => {
    const s = jobStatus(j, parts, now);
    return j.urgent && s !== "overdue" && s !== "done" ? 1 : RANK[s];
  };
  const due = (j: Job) => (j.due_at ? Date.parse(j.due_at) : Infinity);
  return [...jobs].sort((a, b) => rank(a) - rank(b) || due(a) - due(b));
}

/** Who was meant to do an overdue job: the people on it before it was due (named on the rescue card). */
export const meantToDoIt = (jobId: string, parts: Participant[]) =>
  parts.filter((p) => p.job_id === jobId && !p.deleted_at && (p.status === "active" || p.status === "unable")).map((p) => p.member_id);

// ---------------------------------------------------------------- reminders (in the app until push alerts arrive)

const TWO_HOURS = 2 * 3600_000;

/**
 * My open jobs that haven't nagged me for 2 hours, only between 07:00 and 21:00 Nairobi time,
 * and only while I'm at home: being out (errands, school) or away pauses them.
 */
export function dueReminders(
  jobs: Job[],
  parts: Participant[],
  meId: string | undefined,
  now = Date.now(),
  lastShown: Record<string, number> = {},
  presence: string = "at_home",
): Job[] {
  if (!meId || presence !== "at_home") return [];
  const hour = new Date(now + 3 * 3600_000).getUTCHours();
  if (hour < 7 || hour >= 21) return [];
  return jobs.filter((j) => {
    if (j.done_at || j.deleted_at) return false;
    const mine = workers(j.id, parts).find((p) => p.member_id === meId);
    if (!mine) return false;
    const since = Math.max(Date.parse(mine.created_at ?? "") || 0, lastShown[j.id] ?? 0);
    return now - since >= TWO_HOURS;
  });
}

// ---------------------------------------------------------------- learning real times

/**
 * How long a usual job really takes: the middle of the last 5 times someone tapped
 * "I'm starting" and then Done (5 min to 8 h, so a forgotten Done doesn't count).
 * Null until it has 2 real times.
 */
export function learnedDuration(jobs: Job[], templateKey: string): { minutes: number; samples: number } | null {
  const times = jobs
    .filter((j) => j.template_key === templateKey && j.started_at && j.done_at && !j.deleted_at)
    .sort((a, b) => b.done_at!.localeCompare(a.done_at!))
    .map((j) => (Date.parse(j.done_at!) - Date.parse(j.started_at!)) / 60_000)
    .filter((m) => m >= 5 && m <= 480)
    .slice(0, 5)
    .sort((a, b) => a - b);
  if (times.length < 2) return null;
  const mid = times.length / 2;
  const median = times.length % 2 ? times[Math.floor(mid)] : (times[mid - 1] + times[mid]) / 2;
  return { minutes: Math.max(5, Math.round(median / 5) * 5), samples: times.length };
}

// ---------------------------------------------------------------- waiting jobs

/** Days a job has sat with nobody on it; at `after` days it goes on the meeting agenda. */
export function waitingDays(job: Job, parts: Participant[], now = Date.now()): number {
  if (job.done_at || job.deleted_at || !job.created_at || workers(job.id, parts).length) return 0;
  return Math.floor((now - Date.parse(job.created_at)) / 86400_000);
}

export const forAgenda = (jobs: Job[], parts: Participant[], after = 3, now = Date.now()) =>
  jobs.filter((j) => !isUpcoming(j, now) && waitingDays(j, parts, now) >= after);
