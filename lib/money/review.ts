// The monthly review (after Monarch): a few cards about last month, each true on its own, that
// open the money part of the family meeting and become Peter's WhatsApp summary.
import { billStats, type Bill } from "./bills";
import { flexSummary, type Kind } from "./flex";
import { chippedIn, liveEntries, monthOf, monthSummary, owedTo, projectProgress, type Budget, type Entry, type Project } from "./money";
import type { SLink, SNode } from "./sankey";

const n = (x: unknown) => Number(x ?? 0);
const kes = (x: number) => `KES ${Math.round(x).toLocaleString("en-KE")}`;
const lastDay = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);

/** Who put money in during a month: by who sent it, else who logged it. Most first. */
export function moneyInBy(entries: Entry[], months: string[], nameOf: (id: string) => string) {
  const by = new Map<string, number>();
  for (const e of liveEntries(entries)) {
    if (e.direction !== "in" || e.project_id || !months.includes(monthOf(e.occurred_on))) continue;
    const who = e.counterparty?.trim() || (e.spent_by ? nameOf(e.spent_by) : "") || "Not given";
    by.set(who, (by.get(who) ?? 0) + n(e.amount_kes));
  }
  return [...by].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

/**
 * The Sankey for one or more months: who put money in → Fixed / Flexible / Non-monthly / Kept →
 * each kind. Spending beyond what came in shows as "Earlier months" so the sides match.
 */
export function moneyFlow(entries: Entry[], kinds: Kind[], months: string[], nameOf: (id: string) => string) {
  const sources = moneyInBy(entries, months, nameOf);
  const spentBy = new Map<string | null, number>();
  for (const m of months) for (const [k, v] of monthSummary(entries, m).byCategory) spentBy.set(k, (spentBy.get(k) ?? 0) + v);
  const groupOf = (id: string | null) => kinds.find((k) => k.id === id)?.budget_group ?? "flexible";
  const nameOfKind = (id: string | null) => kinds.find((k) => k.id === id)?.name ?? "Not sorted";
  const groups = [
    { id: "g:fixed", label: "Fixed", group: "fixed" },
    { id: "g:flexible", label: "Flexible", group: "flexible" },
    { id: "g:non_monthly", label: "Non-monthly", group: "non_monthly" },
  ];
  const spent = [...spentBy.values()].reduce((s, v) => s + v, 0);
  const moneyIn = sources.reduce((s, x) => s + x.value, 0);
  const left: SNode[] = sources.map((s) => ({ id: `s:${s.label}`, label: s.label, value: s.value, tone: "in" }));
  if (spent > moneyIn) left.push({ id: "s:earlier", label: "Earlier months", value: spent - moneyIn, tone: "muted" });
  const total = Math.max(spent, moneyIn);
  const middle: SNode[] = groups.map((g) => ({ id: g.id, label: g.label, value: [...spentBy].filter(([k]) => groupOf(k) === g.group).reduce((s, [, v]) => s + v, 0), tone: g.group }));
  if (moneyIn > spent) middle.push({ id: "g:kept", label: "Kept", value: moneyIn - spent, tone: "kept" });
  const order = (g: string) => groups.findIndex((x) => x.group === g);
  const kindRows = [...spentBy]
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ id: `k:${k ?? "none"}`, label: nameOfKind(k), value: v, group: groupOf(k) }))
    .sort((a, b) => order(a.group) - order(b.group) || b.value - a.value);
  const right: SNode[] = kindRows.map((r) => ({ id: r.id, label: r.label, value: r.value, tone: r.group }));
  const links: SLink[] = [];
  // Each source splits across the middle in proportion, so ribbons stay readable.
  for (const s of left) for (const m of middle) if (m.value > 0) links.push({ from: s.id, to: m.id, value: (s.value * m.value) / total });
  for (const r of kindRows) links.push({ from: `g:${r.group}`, to: r.id, value: r.value });
  return { columns: [left, middle, right], links, moneyIn, spent };
}

export type Review = ReturnType<typeof monthlyReview>;

export function monthlyReview(
  month: string,
  data: { entries: Entry[]; kinds: Kind[]; budgets: Budget[]; bills: Bill[]; projects: Project[]; reviews: { status: string; deleted_at?: string | null }[]; nameOf: (id: string) => string },
) {
  const { entries, kinds, budgets, bills, projects, reviews, nameOf } = data;
  const s = monthSummary(entries, month);
  const end = lastDay(month);
  const flex = flexSummary(kinds, budgets, entries, month, end);
  const topKinds = flex.rows
    .filter((r) => r.spent > 0)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 4)
    .map((r) => ({ name: r.kind.name, spent: r.spent, plan: r.available, over: r.available > 0 && r.spent > r.available }));
  const billLines = bills
    .filter((b) => !b.deleted_at)
    .map((b) => {
      const st = billStats(b, entries, end);
      const used = liveEntries(entries)
        .filter((e) => e.bill_id === b.id && monthOf(e.occurred_on) === month)
        .reduce((x, e) => x + n(e.usage_qty), 0);
      return { name: b.name, unit: b.usage_unit ?? null, paid: st.thisMonth, usual: st.usualMonth, change: st.change, used };
    })
    .filter((b) => b.paid > 0);
  const goals = projects
    .filter((p) => !p.deleted_at)
    .map((p) => {
      const added = liveEntries(entries)
        .filter((e) => e.project_id === p.id && e.direction === "in" && monthOf(e.occurred_on) === month)
        .reduce((x, e) => x + n(e.amount_kes), 0);
      return { title: p.title, added, pct: projectProgress(p, entries).pct, givers: chippedIn(p, entries, nameOf), done: p.status === "done" };
    })
    .filter((g) => g.added > 0);
  return {
    month,
    moneyIn: s.moneyIn,
    moneyOut: s.moneyOut,
    kept: s.moneyIn - s.moneyOut,
    keptPct: s.moneyIn > 0 ? Math.round(((s.moneyIn - s.moneyOut) / s.moneyIn) * 100) : null,
    sources: moneyInBy(entries, [month], nameOf),
    flexPlan: flex.flexPlan,
    flexSpent: flex.flexSpent,
    topKinds,
    bills: billLines,
    goals,
    openQuestions: reviews.filter((r) => !r.deleted_at && r.status === "open").length,
    owed: owedTo(entries).map((o) => ({ name: nameOf(o.member), amount: o.owed })),
  };
}

const monthName = (m: string) => new Date(`${m}-15T09:00:00Z`).toLocaleDateString("en-KE", { month: "long", year: "numeric" });

/** Peter's WhatsApp summary, from the same review the family sees. */
export function reviewText(r: Review): string {
  const lines = [`Kimemiah house money, ${monthName(r.month)}`, ""];
  lines.push(`In: ${kes(r.moneyIn)}${r.sources.length > 1 ? ` (${r.sources.map((x) => `${x.label} ${kes(x.value)}`).join(", ")})` : ""}`);
  lines.push(`Spent: ${kes(r.moneyOut)}`);
  lines.push(r.kept >= 0 ? `Kept: ${kes(r.kept)}${r.keptPct !== null ? ` (${r.keptPct}%)` : ""}` : `Spent ${kes(-r.kept)} more than came in`);
  if (r.topKinds.length) {
    lines.push("", "Biggest spending:");
    for (const k of r.topKinds) lines.push(`- ${k.name}: ${kes(k.spent)}${k.plan ? ` of ${kes(k.plan)}${k.over ? " (over)" : ""}` : ""}`);
  }
  if (r.bills.length) {
    lines.push("", "Bills:");
    for (const b of r.bills) lines.push(`- ${b.name}: ${kes(b.paid)}${b.used && b.unit ? `, ${b.used.toLocaleString("en-KE")} ${b.unit}` : ""}${b.change !== null && Math.abs(b.change) >= 15 ? ` (${Math.abs(b.change)}% ${b.change > 0 ? "more" : "less"} than usual)` : ""}`);
  }
  if (r.goals.length) {
    lines.push("", "Goals:");
    for (const g of r.goals) lines.push(`- ${g.title}: +${kes(g.added)}, now ${g.pct}%${g.done ? " (done)" : ""}`);
  }
  if (r.owed.length) lines.push("", `To pay back: ${r.owed.map((o) => `${o.name} ${kes(o.amount)}`).join(", ")}`);
  return lines.join("\n");
}
