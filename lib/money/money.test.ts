import { describe, expect, it } from "vitest";
import { liveEntries, monthSummary, projectProgress, runsToUnlock, summaryText, type Entry } from "./money";
import { parseMpesa } from "./mpesa";

describe("M-Pesa SMS", () => {
  it("reads a payment to a till or shop", () => {
    expect(
      parseMpesa("SJK7AB12CD Confirmed. Ksh1,060.00 paid to NAIVAS KAHAWA SUKARI. on 21/10/26 at 5:43 PM.New M-PESA balance is Ksh2,340.00. Transaction cost, Ksh0.00."),
    ).toEqual({ code: "SJK7AB12CD", kind: "paid", direction: "out", amount: 1060, counterparty: "NAIVAS KAHAWA SUKARI", date: "2026-10-21" });
  });

  it("reads money sent to a person or a paybill", () => {
    expect(parseMpesa("SJL1XY23ZQ Confirmed. Ksh500.00 sent to JOHN OTIENO 0722123456 on 22/10/26 at 1:05 PM. New M-PESA balance is Ksh1,840.00.")).toMatchObject({
      kind: "sent",
      direction: "out",
      amount: 500,
      counterparty: "JOHN OTIENO",
    });
    expect(parseMpesa("SJL2AB34CD Confirmed. Ksh1,200.00 sent to NAIROBI WATER for account 123456 on 22/10/26 at 9:00 AM New M-PESA balance")).toMatchObject({
      counterparty: "NAIROBI WATER (123456)",
    });
  });

  it("reads money received", () => {
    expect(parseMpesa("SJM9QW87ER Confirmed.You have received Ksh10,000.00 from PETER KIMEMIAH 0711000000 on 20/10/26 at 9:12 AM New M-PESA balance is Ksh12,000.00.")).toEqual({
      code: "SJM9QW87ER",
      kind: "received",
      direction: "in",
      amount: 10000,
      counterparty: "PETER KIMEMIAH",
      date: "2026-10-20",
    });
  });

  it("doesn't count a cash withdrawal as spending, and ignores other text", () => {
    expect(parseMpesa("SJN4RT56YU Confirmed.on 21/10/26 at 2:00 PMWithdraw Ksh1,000.00 from 123456 - Kahawa Agent New M-PESA balance")).toMatchObject({ kind: "withdraw", direction: null, amount: 1000 });
    expect(parseMpesa("Your data bundle balance is 1GB")).toBeNull();
  });
});

const e = (o: Partial<Entry> & Pick<Entry, "id" | "direction" | "amount_kes">): Entry => ({ occurred_on: "2026-10-10", ...o });

describe("money", () => {
  const entries: Entry[] = [
    e({ id: "in1", direction: "in", amount_kes: 10000 }),
    e({ id: "out1", direction: "out", amount_kes: 2350, category_id: "food" }),
    e({ id: "out2", direction: "out", amount_kes: 999, category_id: "food" }),
    e({ id: "fix", direction: "out", amount_kes: 999, voids_entry_id: "out2" }), // correction: out2 was a mistake
    e({ id: "gate", direction: "in", amount_kes: 3000, project_id: "p1" }), // set aside for a project
    e({ id: "sept", direction: "in", amount_kes: 5000, occurred_on: "2026-09-30" }),
  ];

  it("10,000 in and 2,350 out leaves 7,650; corrections and project money don't count", () => {
    expect(liveEntries(entries).map((x) => x.id)).toEqual(["in1", "out1", "gate", "sept"]);
    const s = monthSummary(entries, "2026-10");
    expect([s.moneyIn, s.moneyOut, s.left]).toEqual([10000, 2350, 7650]);
    expect(s.byCategory.get("food")).toBe(2350);
  });

  it("tracks a project toward its target", () => {
    const p = { id: "p1", title: "Repaint the gate", kind: "house_work" as const, target_kes: 6000, status: "saving" };
    expect(projectProgress(p, entries)).toEqual({ raised: 3000, spent: 0, left: 3000, pct: 50, funded: false });
    expect(projectProgress(p, [...entries, e({ id: "g2", direction: "in", amount_kes: 3000, project_id: "p1" })]).funded).toBe(true);
  });

  it("unlocks the runs the balance covers, soonest first, without promising the same money twice", () => {
    const jobs = [
      { id: "market", requires_funds: true, funds_status: "discussing", estimated_cost_kes: 3000, planned_for: "2026-10-25" },
      { id: "super", requires_funds: true, funds_status: "discussing", estimated_cost_kes: 6000, planned_for: "2026-10-24" },
      { id: "gas", requires_funds: true, funds_status: "discussing", estimated_cost_kes: 3500, planned_for: "2026-10-26" },
      { id: "nocost", requires_funds: true, funds_status: "discussing", estimated_cost_kes: null },
      { id: "ready", requires_funds: true, funds_status: "funds_ready", estimated_cost_kes: 100 },
    ];
    expect(runsToUnlock(jobs, 7650)).toEqual(["super"]); // 6,000 first; 1,650 left covers neither of the others
    expect(runsToUnlock(jobs, 13000)).toEqual(["super", "market", "gas"]); // 6,000 + 3,000 + 3,500
  });

  it("writes the summary for Peter", () => {
    const s = monthSummary(entries, "2026-10");
    const text = summaryText("2026-10", s, (id) => (id === "food" ? "Food staples" : "Other"), [{ title: "Repaint the gate", raised: 3000, target: 6000 }]);
    expect(text).toContain("In: KES 10,000");
    expect(text).toContain("Left: KES 7,650");
    expect(text).toContain("- Food staples: KES 2,350");
    expect(text).toContain("- Repaint the gate: KES 3,000 of KES 6,000");
  });
});
