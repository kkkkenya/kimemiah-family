// Flex budgeting (after Monarch): every kind of spending is Fixed, Flexible or Non-monthly.
// Fixed costs are known and non-monthly ones are saved for, so day to day the family watches
// one number: flexible money left.
import { budgetAvailable, type Budget, type Entry } from "./money";

export type Group = "fixed" | "flexible" | "non_monthly";
export type Kind = { id: string; name: string; sort?: number; rollover?: boolean; budget_group?: Group; deleted_at?: string | null };

export const GROUPS: { id: Group; label: string; hint: string }[] = [
  { id: "fixed", label: "Fixed", hint: "Same every month" },
  { id: "flexible", label: "Flexible", hint: "Changes month to month" },
  { id: "non_monthly", label: "Non-monthly", hint: "Saved for a bit each month" },
];

const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

/**
 * Where a kind will end the month at its pace so far. Only from the 10th (earlier is guesswork),
 * only for the current month, and never below what's already spent.
 */
export function forecast(spent: number, month: string, today: string): number | null {
  if (today.slice(0, 7) !== month) return null;
  const day = Number(today.slice(8, 10));
  if (day < 10 || spent <= 0) return null;
  return Math.max(spent, Math.round((spent / day) * daysIn(month)));
}

export function flexSummary(kinds: Kind[], budgets: Budget[], entries: Entry[], month: string, today: string) {
  const rows = kinds
    .filter((k) => !k.deleted_at)
    .map((k) => {
      const group: Group = k.budget_group ?? "flexible";
      // Non-monthly kinds always carry over: that's how a yearly cost gets saved for.
      const b = budgetAvailable(budgets, entries, k.id, month, group === "non_monthly" || !!k.rollover);
      return { kind: k, group, ...b, forecast: group === "flexible" ? forecast(b.spent, month, today) : null, pct: b.available > 0 ? b.spent / b.available : b.spent > 0 ? 1 : 0 };
    });
  const groups = GROUPS.map((g) => {
    const mine = rows.filter((r) => r.group === g.id);
    const plan = mine.reduce((s, r) => s + r.available, 0);
    const spent = mine.reduce((s, r) => s + r.spent, 0);
    return { ...g, rows: mine, plan, spent, left: plan - spent };
  });
  const flex = groups.find((g) => g.id === "flexible")!;
  const daysLeft = today.slice(0, 7) === month ? daysIn(month) - Number(today.slice(8, 10)) + 1 : 0;
  return { rows, groups, flexLeft: flex.left, flexPlan: flex.plan, flexSpent: flex.spent, daysLeft, perDay: daysLeft > 0 && flex.left > 0 ? Math.floor(flex.left / daysLeft) : 0 };
}
