import { describe, expect, it } from "vitest";
import { moneyFlow, monthlyReview, reviewText } from "./review";
import { sankeyLayout } from "./sankey";
import type { Entry } from "./money";

const kinds = [
  { id: "food", name: "Food", budget_group: "flexible" as const },
  { id: "net", name: "Internet", budget_group: "fixed" as const },
];
const names: Record<string, string> = { greg: "Greg", dan: "Daniel" };
const nameOf = (id: string) => names[id] ?? id;
const e = (id: string, o: Partial<Entry>): Entry => ({ id, direction: "out", occurred_on: "2026-09-10", amount_kes: 0, ...o });
const entries: Entry[] = [
  e("1", { direction: "in", amount_kes: 40000, counterparty: "Peter" }),
  e("2", { direction: "in", amount_kes: 10000, spent_by: "dan" }),
  e("3", { amount_kes: 30000, category_id: "food" }),
  e("4", { amount_kes: 3000, category_id: "net" }),
  e("5", { amount_kes: 3300, category_id: "food", paid_from: "own", spent_by: "greg" }),
];

describe("money flow (Sankey)", () => {
  it("runs from who put money in, through the groups and Kept, to each kind", () => {
    const f = moneyFlow(entries, kinds, ["2026-09"], nameOf);
    expect(f.columns[0].map((n) => n.label)).toEqual(["Peter", "Daniel"]);
    expect(f.columns[1].map((n) => [n.label, n.value])).toEqual([["Fixed", 3000], ["Flexible", 33300], ["Non-monthly", 0], ["Kept", 13700]]);
    expect(f.columns[2].map((n) => n.label)).toEqual(["Internet", "Food"]);
    const fromPeter = f.links.filter((l) => l.from === "s:Peter").reduce((s, l) => s + l.value, 0);
    expect(fromPeter).toBeCloseTo(40000);
  });

  it("adds 'Earlier months' when more was spent than came in", () => {
    const f = moneyFlow([e("x", { amount_kes: 5000, category_id: "food" })], kinds, ["2026-09"], nameOf);
    expect(f.columns[0]).toEqual([{ id: "s:earlier", label: "Earlier months", value: 5000, tone: "muted" }]);
  });

  it("lays out bands to one scale that fills the height", () => {
    const f = moneyFlow(entries, kinds, ["2026-09"], nameOf);
    const s = sankeyLayout(f.columns, f.links, 600, 300, 10, 8);
    // The middle column (Fixed, Flexible, Kept) has the most gaps, so it's the one that fills.
    const middle = s.nodes.filter((n) => n.col === 1);
    expect(middle.reduce((x, n) => x + n.h, 0) + 8 * (middle.length - 1)).toBeCloseTo(300);
    for (const l of s.links) expect(l.h).toBeGreaterThan(0);
    const food = s.nodes.find((n) => n.id === "k:food")!;
    expect(food.h).toBeCloseTo((33300 / 50000) * (300 - 16));
  });
});

describe("monthly review", () => {
  const r = monthlyReview("2026-09", {
    entries,
    kinds,
    budgets: [{ category_id: "food", month: "2026-09-01", amount_kes: 30000 }],
    bills: [],
    projects: [],
    reviews: [{ status: "open" }, { status: "ok" }],
    nameOf,
  });

  it("sums the month and names who put money in", () => {
    expect(r).toMatchObject({ moneyIn: 50000, moneyOut: 36300, kept: 13700, keptPct: 27, openQuestions: 1 });
    expect(r.sources).toEqual([{ label: "Peter", value: 40000 }, { label: "Daniel", value: 10000 }]);
    expect(r.topKinds[0]).toEqual({ name: "Food", spent: 33300, plan: 30000, over: true });
    expect(r.owed).toEqual([{ name: "Greg", amount: 3300 }]);
  });

  it("writes Peter's summary from the same figures", () => {
    const t = reviewText(r);
    expect(t).toContain("In: KES 50,000 (Peter KES 40,000, Daniel KES 10,000)");
    expect(t).toContain("Kept: KES 13,700 (27%)");
    expect(t).toContain("- Food: KES 33,300 of KES 30,000 (over)");
    expect(t).toContain("To pay back: Greg KES 3,300");
  });
});
