// Bills (water, gas, internet): what each one costs, how much the house uses, and when it's next
// due. The point is to make usage visible: "this month's water was 40% more than usual".
import { liveEntries, monthOf, type Entry } from "./money";

export type Bill = {
  id: string;
  name: string;
  category_id?: string | null;
  usage_unit?: string | null;
  every_days?: number | null;
  usual_kes?: number | null;
  note?: string | null;
  sort?: number;
  deleted_at?: string | null;
};

const n = (x: unknown) => Number(x ?? 0);
const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const plus = (d: string, by: number) => new Date(Date.parse(`${d}T00:00:00Z`) + by * DAY).toISOString().slice(0, 10);
const back = (month: string, by: number) => {
  const d = new Date(`${month}-15T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - by);
  return d.toISOString().slice(0, 7);
};

export type BillStats = {
  payments: Entry[];
  last?: Entry;
  thisMonth: number;
  /** Average of the months before this one that had a payment (up to six). */
  usualMonth: number | null;
  /** This month against the usual, in percent (+40 = 40% more). */
  change: number | null;
  /** KES per unit over the recent payments. */
  perUnit: number | null;
  /** Days one purchase lasts, from the gaps between payments. */
  lasts: number | null;
  /** Units used per day, from what was bought and how long it lasted. */
  perDay: number | null;
  nextDue: string | null;
  /** Negative when overdue. */
  dueIn: number | null;
};

export function billStats(bill: Bill, entries: Entry[], today: string): BillStats {
  const payments = liveEntries(entries)
    .filter((e) => e.bill_id === bill.id && e.direction === "out")
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  const last = payments.at(-1);
  const month = monthOf(today);
  const inMonth = (m: string) => payments.filter((e) => monthOf(e.occurred_on) === m).reduce((s, e) => s + n(e.amount_kes), 0);
  const thisMonth = inMonth(month);
  const before = [1, 2, 3, 4, 5, 6].map((by) => inMonth(back(month, by))).filter((v) => v > 0);
  const usualMonth = before.length ? Math.round(before.reduce((s, v) => s + v, 0) / before.length) : null;
  const change = usualMonth && thisMonth ? Math.round(((thisMonth - usualMonth) / usualMonth) * 100) : null;

  const recent = payments.slice(-6);
  const withUsage = recent.filter((e) => n(e.usage_qty) > 0);
  const units = withUsage.reduce((s, e) => s + n(e.usage_qty), 0);
  const perUnit = units > 0 ? withUsage.reduce((s, e) => s + n(e.amount_kes), 0) / units : null;

  const gaps = recent.slice(1).map((e, i) => days(recent[i].occurred_on, e.occurred_on)).filter((g) => g > 0);
  const lasts = gaps.length ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : null;
  // What was bought before the latest purchase was used up by the day of the latest one.
  const span = recent.length > 1 ? days(recent[0].occurred_on, recent.at(-1)!.occurred_on) : 0;
  const usedUp = recent.slice(0, -1).reduce((s, e) => s + n(e.usage_qty), 0);
  const perDay = span > 0 && usedUp > 0 && recent.slice(0, -1).every((e) => n(e.usage_qty) > 0) ? usedUp / span : null;

  const cycle = bill.every_days ?? lasts;
  const nextDue = last && cycle ? plus(last.occurred_on, cycle) : null;
  return { payments, last, thisMonth, usualMonth, change, perUnit, lasts, perDay, nextDue, dueIn: nextDue ? days(today, nextDue) : null };
}

/** Bills due within `within` days or overdue, soonest first. */
export function billsDue(bills: Bill[], entries: Entry[], today: string, within = 5) {
  return bills
    .filter((b) => !b.deleted_at)
    .map((bill) => ({ bill, stats: billStats(bill, entries, today) }))
    .filter((x) => x.stats.dueIn !== null && x.stats.dueIn <= within)
    .sort((a, b) => a.stats.dueIn! - b.stats.dueIn!);
}

/** One plain sentence about a bill, for the family to notice. */
export function billInsight(bill: Bill, s: BillStats): string | null {
  const unit = bill.usage_unit;
  if (s.change !== null && Math.abs(s.change) >= 15) return `${Math.abs(s.change)}% ${s.change > 0 ? "more" : "less"} than a usual month`;
  if (s.perDay && unit) return `About ${s.perDay >= 10 ? Math.round(s.perDay) : s.perDay.toFixed(1)} ${unit} a day`;
  if (s.lasts) return `One lasts about ${s.lasts} days`;
  return null;
}

/**
 * The job a nearly-due bill puts on the board (the server posts it once; the database keeps it
 * to one open job per bill). Monthly bills are paid; the rest are bought when they run out.
 */
export function billJob(bill: Bill, s: BillStats) {
  const cost = s.last ? `Last time ${Math.round(Number(s.last.amount_kes)).toLocaleString("en-KE")} KES. ` : "";
  return {
    title: bill.every_days ? `Pay the ${bill.name.toLowerCase()} bill` : `Buy ${bill.name.toLowerCase()}`,
    notes: `${cost}Log the payment in Money when it's done, so the house can see what it uses.`,
    category: "shopping_errand",
    strain: "light",
    duration_min: 20,
    people_needed: 1,
    kind: "job",
    repeat: "none",
    due_at: `${s.nextDue}T18:00:00.000Z`, // 21:00 Nairobi on the day it's due
    template_key: `bill:${bill.id}`,
  };
}

/**
 * Due dates in a month: the next one, then every cycle after it while it's still that month.
 * Payments already made show on their own day, so nothing is counted twice.
 */
export function dueDatesIn(bill: Bill, s: BillStats, month: string): string[] {
  const cycle = bill.every_days ?? s.lasts;
  if (!s.nextDue) return [];
  const out: string[] = [];
  for (let d = s.nextDue; d.slice(0, 7) <= month; d = plus(d, cycle ?? 9999)) {
    if (d.slice(0, 7) === month) out.push(d);
    if (!cycle) break;
  }
  return out;
}

const normPayee = (s: string) => s.toUpperCase().replace(/\(.*?\)/g, " ").replace(/[^A-Z ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Payments that look like a bill nobody set up: the same payee paid in 3 of the last 4 months,
 * on about the same day (within 6 days), and not already a bill.
 */
export function findRepeats(entries: Entry[], bills: Bill[], today: string) {
  const since = plus(today, -125);
  const known = bills.filter((b) => !b.deleted_at).map((b) => normPayee(b.name));
  const groups = new Map<string, Entry[]>();
  for (const e of liveEntries(entries)) {
    if (e.direction !== "out" || e.bill_id || e.project_id || e.payback_to || !e.counterparty || e.occurred_on < since) continue;
    const key = normPayee(e.counterparty);
    if (!key || known.some((k) => key.includes(k) || k.includes(key))) continue;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return [...groups]
    .map(([payee, list]) => {
      const dayNums = list.map((e) => Number(e.occurred_on.slice(8, 10)));
      return {
        payee,
        name: list.at(-1)!.counterparty!,
        months: new Set(list.map((e) => monthOf(e.occurred_on))).size,
        day: Math.round(dayNums.reduce((a, b) => a + b, 0) / dayNums.length),
        usual: Math.round(list.reduce((a, e) => a + n(e.amount_kes), 0) / list.length),
        spread: Math.max(...dayNums) - Math.min(...dayNums),
        category_id: list.at(-1)!.category_id ?? null,
      };
    })
    .filter((r) => r.months >= 3 && r.spread <= 6)
    .sort((a, b) => b.usual - a.usual);
}
