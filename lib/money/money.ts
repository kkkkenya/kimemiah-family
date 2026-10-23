// The household money picture. Entries are never edited or deleted: a correction is a new
// entry that voids the old one, and both then drop out of every total. Money given to a
// project is set aside, so it isn't counted as this month's shopping money.

export type Entry = {
  id: string;
  direction: "in" | "out";
  amount_kes: number;
  occurred_on: string;
  category_id?: string | null;
  shop_id?: string | null;
  project_id?: string | null;
  bill_id?: string | null;
  usage_qty?: number | null;
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

/** The two kinds that are food: Food (supermarket shops) and Market and fresh. */
export const FOOD_CATEGORIES = ["00000000-0000-0000-0003-000000000001", "00000000-0000-0000-0003-000000000002"];

/**
 * Food spending for a month: the total, last month's, a weekly average (weeks so far in the
 * current month), the split by shop, and the last six months for a trend.
 */
export function foodStats(entries: Entry[], month: string, today: string, food: string[] = FOOD_CATEGORIES) {
  const spent = liveEntries(entries).filter((e) => e.direction === "out" && !e.project_id && food.includes(e.category_id ?? ""));
  const total = (m: string) => spent.filter((e) => monthOf(e.occurred_on) === m).reduce((s, e) => s + n(e.amount_kes), 0);
  const back = (by: number) => {
    const d = new Date(`${month}-15T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - by);
    return d.toISOString().slice(0, 7);
  };
  const thisMonth = total(month);
  const days = monthOf(today) === month ? Number(today.slice(8, 10)) : new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const byShop = new Map<string | null, number>();
  for (const e of spent.filter((x) => monthOf(x.occurred_on) === month)) byShop.set(e.shop_id ?? null, (byShop.get(e.shop_id ?? null) ?? 0) + n(e.amount_kes));
  return {
    total: thisMonth,
    lastMonth: total(back(1)),
    perWeek: Math.round((thisMonth / days) * 7),
    byShop: [...byShop].sort((a, b) => b[1] - a[1]),
    trend: [5, 4, 3, 2, 1, 0].map((by) => ({ month: back(by), total: total(back(by)) })),
  };
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

const shiftMonth = (month: string, by: number) => {
  const d = new Date(`${month}-15T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};

/** Household money in and out for the `count` months up to `month`, and what was kept. */
export function cashFlow(entries: Entry[], month: string, count = 6) {
  return Array.from({ length: count }, (_, i) => {
    const m = shiftMonth(month, i - count + 1);
    const s = monthSummary(entries, m);
    return { month: m, moneyIn: s.moneyIn, moneyOut: s.moneyOut, kept: s.moneyIn - s.moneyOut, keptPct: s.moneyIn > 0 ? Math.round(((s.moneyIn - s.moneyOut) / s.moneyIn) * 100) : null };
  });
}

/**
 * A project's pace toward its date: what to put aside each month from now, and how far ahead
 * or behind a steady pace it is (positive = ahead).
 */
export function projectPace(p: Project & { target_date?: string | null; created_at?: string }, entries: Entry[], today: string) {
  if (!p.target_date) return null;
  const g = projectProgress(p, entries);
  // Months still to save in, counting this one and the target's.
  const monthsLeft = Math.max(1, (Number(p.target_date.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + Number(p.target_date.slice(5, 7)) - Number(today.slice(5, 7)) + 1);
  const perMonth = Math.ceil(g.left / monthsLeft);
  const start = Date.parse((p.created_at ?? today).slice(0, 10));
  const end = Date.parse(p.target_date);
  const share = end > start ? Math.min(1, Math.max(0, (Date.parse(today) - start) / (end - start))) : 1;
  const ahead = Math.round(g.raised - n(p.target_kes) * share);
  return { perMonth, monthsLeft, ahead, late: today > p.target_date && !g.funded };
}

export type Budget = { category_id: string; month: string; amount_kes: number };

/** The plan for a month: that month's own, or else the latest month before it that had one. */
export function planFor(budgets: Budget[], categoryId: string, month: string): number {
  const mine = budgets.filter((b) => b.category_id === categoryId && b.month.slice(0, 7) <= month).sort((a, b) => b.month.localeCompare(a.month));
  return n(mine[0]?.amount_kes);
}

/**
 * What a kind of spending has this month. With rollover on, what was left (or overspent) in
 * earlier months since its first plan carries in, up to a year back.
 */
export function budgetAvailable(budgets: Budget[], entries: Entry[], categoryId: string, month: string, rollover: boolean) {
  const plan = planFor(budgets, categoryId, month);
  let carry = 0;
  if (rollover) {
    const first = budgets.filter((b) => b.category_id === categoryId).map((b) => b.month.slice(0, 7)).sort()[0];
    for (let by = 12; by >= 1; by--) {
      const m = shiftMonth(month, -by);
      if (!first || m < first) continue;
      carry += planFor(budgets, categoryId, m) - (monthSummary(entries, m).byCategory.get(categoryId) ?? 0);
    }
  }
  const spent = monthSummary(entries, month).byCategory.get(categoryId) ?? 0;
  return { plan, carry, available: plan + carry, spent, left: plan + carry - spent };
}
