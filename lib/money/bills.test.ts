import { describe, expect, it } from "vitest";
import { billInsight, billJob, billStats, billsDue, dueDatesIn, findRepeats, type Bill } from "./bills";
import type { Entry } from "./money";

const pay = (id: string, occurred_on: string, amount_kes: number, usage_qty: number | null, bill_id = "gas"): Entry => ({ id, direction: "out", occurred_on, amount_kes, usage_qty, bill_id });

describe("bills", () => {
  const gas: Bill = { id: "gas", name: "Cooking gas", usage_unit: "kg" };
  const internet: Bill = { id: "net", name: "Internet", every_days: 30 };
  const entries = [
    pay("g1", "2026-07-01", 3200, 13),
    pay("g2", "2026-08-10", 3300, 13),
    pay("g3", "2026-09-20", 3300, 13),
    pay("n1", "2026-10-01", 3000, null, "net"),
    { id: "x", direction: "out", occurred_on: "2026-10-02", amount_kes: 9999, category_id: "food" } as Entry,
  ];

  it("works out cost per unit, how long one lasts and use per day", () => {
    const s = billStats(gas, entries, "2026-10-23");
    expect(s.payments).toHaveLength(3);
    expect(s.perUnit).toBeCloseTo(9800 / 39);
    expect(s.lasts).toBe(41); // 40 and 41 days between refills, rounded
    expect(s.perDay).toBeCloseTo(26 / 81);
    expect(s.nextDue).toBe("2026-10-31");
    expect(s.dueIn).toBe(8);
  });

  it("compares this month with a usual month", () => {
    const water: Bill = { id: "w", name: "Water", usage_unit: "litres" };
    const w = [pay("a", "2026-08-05", 1000, 5000, "w"), pay("b", "2026-09-05", 1000, 5000, "w"), pay("c", "2026-10-05", 1400, 7000, "w")];
    const s = billStats(water, w, "2026-10-23");
    expect(s.usualMonth).toBe(1000);
    expect(s.change).toBe(40);
    expect(billInsight(water, s)).toBe("40% more than a usual month");
  });

  it("uses the bill's own cycle when it has one, and lists what's due soon", () => {
    expect(billStats(internet, entries, "2026-10-23").nextDue).toBe("2026-10-31");
    expect(billsDue([gas, internet], entries, "2026-10-28").map((x) => x.bill.id)).toEqual(["gas", "net"]);
    expect(billsDue([gas, internet], entries, "2026-10-20")).toEqual([]);
  });

  it("says nothing it can't back up", () => {
    const s = billStats({ id: "new", name: "New" }, entries, "2026-10-23");
    expect(s.nextDue).toBeNull();
    expect(billInsight({ id: "new", name: "New" }, s)).toBeNull();
  });
});

describe("bill jobs", () => {
  it("names the job by kind of bill and points back to Money", () => {
    const gas: Bill = { id: "gas", name: "Cooking gas", usage_unit: "kg" };
    const s = billStats(gas, [pay("a", "2026-09-01", 3300, 13), pay("b", "2026-10-10", 3300, 13)], "2026-11-15");
    const j = billJob(gas, s);
    expect(j.title).toBe("Buy cooking gas");
    expect(j.template_key).toBe("bill:gas");
    expect(j.due_at).toBe(`${s.nextDue}T18:00:00.000Z`);
    expect(j.notes).toContain("3,300");
    expect(billJob({ id: "n", name: "Internet", every_days: 30 }, s).title).toBe("Pay the internet bill");
  });
});

describe("calendar and repeats", () => {
  it("lists every due date in a month for a bill with a cycle", () => {
    const net: Bill = { id: "n", name: "Internet", every_days: 14 };
    const s = billStats(net, [pay("1", "2026-10-28", 1500, null, "n")], "2026-10-30");
    expect(dueDatesIn(net, s, "2026-11")).toEqual(["2026-11-11", "2026-11-25"]);
    expect(dueDatesIn(net, s, "2026-10")).toEqual([]);
  });

  it("spots a payee paid on about the same day three months running", () => {
    const zuku = (id: string, d: string): Entry => ({ id, direction: "out", occurred_on: d, amount_kes: 2999, counterparty: "ZUKU FIBER (654321)", category_id: "net" });
    const entries: Entry[] = [zuku("a", "2026-08-05"), zuku("b", "2026-09-06"), zuku("c", "2026-10-04"), { id: "d", direction: "out", occurred_on: "2026-10-09", amount_kes: 300, counterparty: "KIOSK" }];
    const r = findRepeats(entries, [], "2026-10-23");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ payee: "ZUKU FIBER", months: 3, day: 5, usual: 2999 });
    expect(findRepeats(entries, [{ id: "z", name: "Zuku fiber" }], "2026-10-23")).toEqual([]);
  });
});
