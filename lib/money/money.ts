// The household money picture. Entries are never edited or deleted: a correction is a new
// entry that voids the old one, and both then drop out of every total. Money given to a
// project is set aside, so it isn't counted as this month's shopping money.

export type Entry = {
  id: string;
  direction: "in" | "out";
  amount_kes: number;
  occurred_on: string;
  category_id?: string | null;
  project_id?: string | null;
  voids_entry_id?: string | null;
  note?: string | null;
  counterparty?: string | null;
  mpesa_code?: string | null;
  deleted_at?: string | null;
};

export type Project = { id: string; title: string; kind: "house_work" | "upgrade"; target_kes: number; status: string; job_id?: string | null; deleted_at?: string | null };

const n = (x: unknown) => Number(x ?? 0);

/** Entries that count: not removed, not a correction, not corrected. */
export function liveEntries(entries: Entry[]): Entry[] {
  const voided = new Set(entries.filter((e) => !e.deleted_at && e.voids_entry_id).map((e) => e.voids_entry_id));
  return entries.filter((e) => !e.deleted_at && !e.voids_entry_id && !voided.has(e.id));
}

export const monthOf = (day: string) => day.slice(0, 7);

/** This month's household money (projects left out): in, out, left, and spending by category. */
export function monthSummary(entries: Entry[], month: string) {
  const live = liveEntries(entries).filter((e) => !e.project_id && monthOf(e.occurred_on) === month);
  const sum = (dir: "in" | "out") => live.filter((e) => e.direction === dir).reduce((s, e) => s + n(e.amount_kes), 0);
  const byCategory = new Map<string | null, number>();
  for (const e of live.filter((x) => x.direction === "out")) byCategory.set(e.category_id ?? null, (byCategory.get(e.category_id ?? null) ?? 0) + n(e.amount_kes));
  const moneyIn = sum("in");
  const moneyOut = sum("out");
  return { moneyIn, moneyOut, left: moneyIn - moneyOut, byCategory, hasIn: live.some((e) => e.direction === "in") };
}

/** A project's money: given toward it, spent on it, and how far to the target. */
export function projectProgress(p: Project, entries: Entry[]) {
  const mine = liveEntries(entries).filter((e) => e.project_id === p.id);
  const raised = mine.filter((e) => e.direction === "in").reduce((s, e) => s + n(e.amount_kes), 0);
  const spent = mine.filter((e) => e.direction === "out").reduce((s, e) => s + n(e.amount_kes), 0);
  return { raised, spent, left: Math.max(0, n(p.target_kes) - raised), pct: Math.min(100, Math.round((raised / n(p.target_kes)) * 100)), funded: raised >= n(p.target_kes) };
}

export type FundedJob = { id: string; requires_funds?: boolean; funds_status?: string; estimated_cost_kes?: number | null; planned_for?: string | null; done_at?: string | null; deleted_at?: string | null };

/**
 * Money runs whose cost the balance now covers, soonest first; each one uses up part of the
 * balance so two runs aren't promised the same money. Runs without a cost need a person to say so.
 */
export function runsToUnlock(jobs: FundedJob[], balance: number): string[] {
  let left = balance;
  const out: string[] = [];
  const waiting = jobs
    .filter((j) => j.requires_funds && j.funds_status === "discussing" && !j.done_at && !j.deleted_at && n(j.estimated_cost_kes) > 0)
    .sort((a, b) => (a.planned_for ?? "9999").localeCompare(b.planned_for ?? "9999"));
  for (const j of waiting) {
    if (n(j.estimated_cost_kes) <= left) {
      out.push(j.id);
      left -= n(j.estimated_cost_kes);
    }
  }
  return out;
}

const kes = (x: number) => `KES ${Math.round(x).toLocaleString("en-KE")}`;

/** The month's summary for Peter on WhatsApp. */
export function summaryText(month: string, s: ReturnType<typeof monthSummary>, categoryName: (id: string | null) => string, projects: { title: string; raised: number; target: number }[]): string {
  const label = new Date(`${month}-15T09:00:00Z`).toLocaleDateString("en-KE", { month: "long", year: "numeric" });
  const lines = [
    `Kimemiah house money, ${label}`,
    `In: ${kes(s.moneyIn)}`,
    `Spent: ${kes(s.moneyOut)}`,
    `Left: ${kes(s.left)}`,
  ];
  const cats = [...s.byCategory].sort((a, b) => b[1] - a[1]);
  if (cats.length) lines.push("", "Spending:", ...cats.map(([id, v]) => `- ${categoryName(id)}: ${kes(v)}`));
  if (projects.length) lines.push("", "Projects:", ...projects.map((p) => `- ${p.title}: ${kes(p.raised)} of ${kes(p.target)}`));
  return lines.join("\n");
}
