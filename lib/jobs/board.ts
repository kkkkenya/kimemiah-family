// Jobs board helpers: spotting a job that's already open before posting it again, and the week
// ahead (each day's jobs, who's on them, and the hours) for planning at the family meeting.
import { workers, type Job, type Participant } from "./logic";

const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const nairobiDay = (iso: string) => new Date(Date.parse(iso) + 3 * 3600_000).toISOString().slice(0, 10);
const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** An open job that's the same as the one about to be posted: same usual job, or the same words. */
export function findDuplicate(next: { title: string; template_key?: string | null }, jobs: Job[]): Job | undefined {
  const t = norm(next.title);
  return jobs.find((j) => !j.done_at && !j.deleted_at && ((next.template_key && j.template_key === next.template_key) || norm(j.title) === t));
}

export type DayPlan = { day: string; jobs: { job: Job; people: string[] }[]; minutes: number };

/**
 * The next `days` days from `today`: every unfinished job due on each day (anything overdue or
 * without a date counts as today), with who's on it and the person-minutes of work.
 */
export function weekAhead(jobs: Job[], parts: Participant[], today: string, days = 7): DayPlan[] {
  const out: DayPlan[] = Array.from({ length: days }, (_, i) => ({ day: plusDays(today, i), jobs: [], minutes: 0 }));
  for (const j of jobs) {
    if (j.done_at || j.deleted_at) continue;
    const due = j.due_at ? nairobiDay(j.due_at) : today;
    const day = due < today ? today : due;
    const slot = out.find((d) => d.day === day);
    if (!slot) continue;
    slot.jobs.push({ job: j, people: workers(j.id, parts).map((w) => w.member_id) });
    slot.minutes += Number(j.duration_min ?? 0) * Math.max(1, Number(j.people_needed ?? 1));
  }
  for (const d of out) d.jobs.sort((a, b) => (a.job.due_at ?? "").localeCompare(b.job.due_at ?? ""));
  return out;
}
