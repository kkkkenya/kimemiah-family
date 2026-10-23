import { describe, expect, it } from "vitest";
import { flexSummary, forecast, type Kind } from "./flex";
import { ruleFor, suggestMatch, type Rule } from "./rules";
import type { Entry } from "./money";

const out = (id: string, occurred_on: string, amount_kes: number, category_id: string): Entry => ({ id, direction: "out", occurred_on, amount_kes, category_id });

describe("flex budgeting", () => {
  const kinds: Kind[] = [
    { id: "food", name: "Food", budget_group: "flexible" },
    { id: "net", name: "Internet", budget_group: "fixed" },
    { id: "fees", name: "School fees", budget_group: "non_monthly" },
  ];
  const budgets = [
    { category_id: "food", month: "2026-10-01", amount_kes: 12000 },
    { category_id: "net", month: "2026-10-01", amount_kes: 3000 },
    { category_id: "fees", month: "2026-09-01", amount_kes: 5000 },
  ];
  const entries = [out("a", "2026-10-05", 6000, "food"), out("b", "2026-10-01", 3000, "net")];

  it("adds each group and keeps one flexible number", () => {
    const f = flexSummary(kinds, budgets, entries, "2026-10", "2026-10-20");
    expect(f.flexPlan).toBe(12000);
    expect(f.flexLeft).toBe(6000);
    expect(f.daysLeft).toBe(12);
    expect(f.perDay).toBe(500);
    expect(f.groups.find((g) => g.id === "fixed")!.left).toBe(0);
    // September's 5,000 for fees wasn't spent, so it carries into October.
    expect(f.groups.find((g) => g.id === "non_monthly")!.plan).toBe(10000);
  });

  it("forecasts from the 10th, this month only, never below what's spent", () => {
    expect(forecast(6000, "2026-10", "2026-10-05")).toBeNull();
    expect(forecast(6000, "2026-10", "2026-10-20")).toBe(9300);
    expect(forecast(6000, "2026-09", "2026-10-20")).toBeNull();
    expect(forecast(6000, "2026-10", "2026-10-31")).toBe(6000);
  });
});

describe("M-Pesa rules", () => {
  const rules: Rule[] = [
    { id: "1", match: "NAIVAS", category_id: "food" },
    { id: "2", match: "NAIVAS KAHAWA", category_id: "food", shop_id: "naivas" },
    { id: "3", match: "NAIROBI WATER", bill_id: "water" },
    { id: "4", match: "OLD", deleted_at: "2026-10-01" },
  ];
  it("picks the longest rule that matches whole words", () => {
    expect(ruleFor("NAIVAS KAHAWA SUKARI", rules)?.id).toBe("2");
    expect(ruleFor("Naivas Thika Road", rules)?.id).toBe("1");
    expect(ruleFor("NAIROBI WATER (123456)", rules)?.id).toBe("3");
    expect(ruleFor("NAIVASHA HOTEL", rules)).toBeUndefined();
    expect(ruleFor("OLD SHOP", rules)).toBeUndefined();
    expect(ruleFor("", rules)).toBeUndefined();
  });
  it("suggests a short match from the payee", () => {
    expect(suggestMatch("NAIROBI WATER (123456)")).toBe("NAIROBI WATER");
    expect(suggestMatch("NAIVAS KAHAWA SUKARI")).toBe("NAIVAS KAHAWA");
    expect(suggestMatch("JOHN OTIENO 0722123456")).toBe("JOHN OTIENO");
  });
});
