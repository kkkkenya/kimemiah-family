import { describe, expect, it } from "vitest";
import { planMoneyAlerts } from "./money";

const people = [
  { id: "greg", name: "Greg" },
  { id: "wanini", name: "Wanini" },
  { id: "peter", name: "Peter", is_remote: true },
];
const noon = Date.parse("2026-10-20T09:00:00Z"); // 12:00 Nairobi
const kinds = [{ id: "food", name: "Food" }];
const budgets = [{ category_id: "food", month: "2026-10-01", amount_kes: 10000 }];

describe("money alerts", () => {
  it("warns at 80% and at 100%, to the people at home", () => {
    const at = (spent: number) => planMoneyAlerts(kinds, budgets, [{ id: "a", direction: "out", occurred_on: "2026-10-05", amount_kes: spent, category_id: "food" }], [], people, noon);
    expect(at(7000)).toEqual([]);
    expect(at(8500).map((a) => a.key)).toEqual(["budget:food:2026-10:80"]);
    expect(at(8500)[0].to).toEqual(["greg", "wanini"]);
    expect(at(10200)[0].title).toBe("Food: this month's budget is used up");
  });

  it("sends a question to the person asked, never back to the asker", () => {
    const a = planMoneyAlerts([], [], [{ id: "e", direction: "out", occurred_on: "2026-10-19", amount_kes: 3300, note: "Gas" }], [{ id: "r", entry_id: "e", ask_to: "wanini", question: "Was this 13 kg?", status: "open", actor_id: "greg" }], people, noon);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ key: "review:r", to: ["wanini"], title: "Greg has a question about a payment" });
    expect(a[0].body).toContain("Was this 13 kg?");
  });

  it("reminds about a bill the evening before it's due, not earlier in the day", () => {
    const gas = { id: "gas", name: "Cooking gas", usage_unit: "kg" };
    const paid = [
      { id: "1", direction: "out" as const, occurred_on: "2026-09-10", amount_kes: 3300, bill_id: "gas", usage_qty: 13 },
      { id: "2", direction: "out" as const, occurred_on: "2026-10-01", amount_kes: 3300, bill_id: "gas", usage_qty: 13 },
    ];
    // Lasts 21 days: next due 22 Oct. Evening of the 21st, 19:00 Nairobi.
    const evening = Date.parse("2026-10-21T16:00:00Z");
    const a = planMoneyAlerts([], [], paid, [], people, evening, [gas]);
    expect(a.map((x) => x.key)).toEqual(["billdue:gas:2026-10-22"]);
    expect(a[0].title).toBe("Cooking gas is due tomorrow");
    expect(planMoneyAlerts([], [], paid, [], people, Date.parse("2026-10-21T09:00:00Z"), [gas])).toEqual([]);
    expect(planMoneyAlerts([], [], paid, [], people, evening, [{ ...gas, remind: false }])).toEqual([]);
  });

  it("holds everything in quiet hours", () => {
    expect(planMoneyAlerts(kinds, budgets, [{ id: "a", direction: "out", occurred_on: "2026-10-05", amount_kes: 9999, category_id: "food" }], [], people, Date.parse("2026-10-20T19:30:00Z"))).toEqual([]);
  });
});
