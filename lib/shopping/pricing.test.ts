import { describe, expect, it } from "vitest";
import {
  bulkValue,
  dealRestock,
  estimate,
  inMode,
  moneyLeftThisMonth,
  pick,
  optionsFor,
  rivalDeal,
  runningLow,
  smartSplit,
  stockStatus,
  storeTotals,
  type CatalogMatch,
  type ListLine,
  type StockLike,
} from "./pricing";

const m = (o: Partial<CatalogMatch> & Pick<CatalogMatch, "id" | "store" | "brand" | "effective_price">): CatalogMatch => ({
  title: `${o.brand} thing`,
  canonical_group_key: "cooking-oil-2l",
  canonical_concept: "cooking-oil",
  pack_size_label: "2L",
  normalized_qty: 2,
  normalized_unit: "liter",
  regular_price: o.effective_price,
  sale_price: null,
  discount_pct: 0,
  unit_price: o.effective_price / 2,
  is_on_sale: false,
  ...o,
});

const oil: StockLike = { id: "oil", name: "Cooking oil", canonical_group_key: "cooking-oil-2l", canonical_concept: "cooking-oil", shopping_tier: "essential" };
const matches: CatalogMatch[] = [
  m({ id: "a", store: "quickmart", brand: "Fresh Fri", effective_price: 626 }),
  m({ id: "b", store: "quickmart", brand: "Golden Fry", effective_price: 599 }),
  m({ id: "c", store: "naivas", brand: "Fresh Fri", effective_price: 545, regular_price: 630, sale_price: 545, discount_pct: 13.5, is_on_sale: true }),
  m({ id: "d", store: "naivas", brand: "Rina", effective_price: 610 }),
  m({ id: "e", store: "quickmart", brand: "Golden Fry", effective_price: 1150, canonical_group_key: "cooking-oil-5l", normalized_qty: 5, unit_price: 230, pack_size_label: "5L" }),
];
const line: ListLine = { id: "l1", title: "Cooking oil", item: oil };

describe("modes", () => {
  it("Essentials hides standard and upgrades; Full shows standard; Upgrades adds QoL", () => {
    expect(inMode("essential", { base: "essential", upgrades: false })).toBe(true);
    expect(inMode("standard", { base: "essential", upgrades: false })).toBe(false);
    expect(inMode("standard", { base: "full", upgrades: false })).toBe(true);
    expect(inMode("qol", { base: "full", upgrades: false })).toBe(false);
    expect(inMode("qol", { base: "essential", upgrades: true })).toBe(true);
  });
});

describe("brand rules", () => {
  it("any brand: cheapest across both stores", () => {
    expect(pick(line, optionsFor(line, matches))?.id).toBe("c");
    expect(pick(line, optionsFor(line, matches), "quickmart")?.id).toBe("b");
  });

  it("prefer a brand: uses it, and flags a rival 12%+ off", () => {
    const pref: ListLine = { ...line, item: { ...oil, preferred_brand: "Rina", brand_flexibility: "prefer_named" } };
    expect(pick(pref, optionsFor(pref, matches))?.id).toBe("d");
    expect(rivalDeal(pref, optionsFor(pref, matches))?.id).toBe("c");
  });

  it("strict brand: nothing else counts, even when missing at a store", () => {
    const strict: ListLine = { ...line, item: { ...oil, preferred_brand: "Rina", brand_flexibility: "strict_named" } };
    expect(pick(strict, optionsFor(strict, matches), "quickmart")).toBeNull();
  });
});

describe("bulk value", () => {
  it("suggests the 5L when it is 8%+ cheaper per litre", () => {
    const tip = bulkValue(line, matches);
    expect(tip?.option.id).toBe("e");
    expect(tip?.savingPct).toBe(16); // 230/L vs 272.50/L
  });

  it("ignores huge packs over 3x the usual size", () => {
    const jerrycan = matches.map((x) => (x.id === "e" ? { ...x, normalized_qty: 20, canonical_group_key: "cooking-oil-20l" } : x));
    expect(bulkValue(line, jerrycan)).toBeNull();
  });

  it("stays quiet when the bigger pack saves less than 8%", () => {
    const close = matches.map((x) => (x.id === "e" ? { ...x, effective_price: 1299, unit_price: 259.8 } : x));
    expect(bulkValue(line, close)).toBeNull();
  });
});

describe("totals", () => {
  const sugar: StockLike = { id: "sugar", name: "Sugar", canonical_group_key: "sugar-2kg", canonical_concept: "sugar" };
  const all = [
    ...matches,
    m({ id: "s1", store: "naivas", brand: "Kabras", effective_price: 330, canonical_group_key: "sugar-2kg", canonical_concept: "sugar" }),
    m({ id: "s2", store: "quickmart", brand: "Mumias", effective_price: 290, regular_price: 340, sale_price: 290, is_on_sale: true, canonical_group_key: "sugar-2kg", canonical_concept: "sugar" }),
  ];
  const lines: ListLine[] = [line, { id: "l2", title: "Sugar", item: sugar }, { id: "l3", title: "Soft broom", item: { id: "x", name: "Soft broom", usual_price_kes: 250 } }, { id: "l4", title: "Mystery", item: { id: "y", name: "Mystery" } }];

  it("estimates with catalog prices, falls back to usual price, counts unpriced", () => {
    expect(estimate(lines, all)).toEqual({ total: 545 + 290 + 250, unpriced: 1 });
  });

  it("compares store baskets with deals and savings", () => {
    const [naivas, quickmart] = storeTotals(lines, all);
    expect(naivas).toMatchObject({ store: "naivas", total: 545 + 330, deals: 1, saves: 85 });
    expect(quickmart).toMatchObject({ store: "quickmart", total: 599 + 290, deals: 1, saves: 50 });
  });

  it("only offers a split run when it saves enough", () => {
    expect(smartSplit(lines, all, 300)).toBeNull();
    const split = smartSplit(lines, all, 10);
    expect(split?.atNaivas).toContain("Cooking oil");
    expect(split?.atQuickmart).toContain("Sugar");
  });
});

describe("anti-kiosk", () => {
  const now = Date.parse("2026-10-21T12:00:00Z");
  const stock: StockLike[] = [
    { id: "milk", name: "Milk", is_fast_mover: true, track_mode: "count", have_qty: 1, min_qty: 4, updated_at: "2026-10-21T08:00:00Z", actor_id: "mom" },
    { id: "bread", name: "Bread", is_fast_mover: true, track_mode: "count", have_qty: 3, min_qty: 1, updated_at: "2026-10-10T08:00:00Z", actor_id: "mom" },
    { id: "eggs", name: "Eggs", is_fast_mover: true, track_mode: "count", have_qty: 2, min_qty: 1, updated_at: "2026-10-20T08:00:00Z", actor_id: "mom" },
    { id: "rice", name: "Rice", is_fast_mover: false, track_mode: "count", have_qty: 0, min_qty: 2, actor_id: "mom" },
    { id: "sugar", name: "Sugar", is_fast_mover: true, track_mode: "count", have_qty: 0, min_qty: 2, updated_at: "2026-10-21T08:00:00Z" },
  ];

  it("lists fast movers that are low, out, or unchecked for 5+ days", () => {
    expect(runningLow(stock, now).map((r) => [r.item.id, r.reason])).toEqual([
      ["milk", "low"],
      ["bread", "unchecked"],
      ["sugar", "unchecked"], // never counted: unknown, not "out"
    ]);
  });

  it("reads status from counts and levels", () => {
    expect(stockStatus({ id: "1", name: "x", track_mode: "count", have_qty: 0, min_qty: 2 })).toBe("out");
    expect(stockStatus({ id: "1", name: "x", track_mode: "level", level: "low" })).toBe("low");
    expect(stockStatus({ id: "1", name: "x", track_mode: "count", have_qty: 0, min_qty: 0 })).toBe("ok");
  });

  it("finds staples worth restocking early on a 15%+ deal", () => {
    const fine: StockLike = { ...oil, track_mode: "count", have_qty: 3, min_qty: 2, actor_id: "mom" };
    const deep = [...matches, m({ id: "z", store: "quickmart", brand: "Rina", effective_price: 500, regular_price: 620, sale_price: 500, discount_pct: 19.4, is_on_sale: true })];
    expect(dealRestock([fine], deep)[0]?.deal.id).toBe("z");
    expect(dealRestock([fine], matches)).toEqual([]);
  });
});

describe("money left", () => {
  it("is null until money in exists, and ignores corrected entries", () => {
    const today = new Date("2026-10-21T12:00:00Z");
    expect(moneyLeftThisMonth([], today)).toBeNull();
    expect(
      moneyLeftThisMonth(
        [
          { id: "1", direction: "in", amount_kes: 10000, occurred_on: "2026-10-01" },
          { id: "2", direction: "out", amount_kes: 2350, occurred_on: "2026-10-05" },
          { id: "3", direction: "out", amount_kes: 999, occurred_on: "2026-10-06" },
          { id: "4", direction: "out", amount_kes: 999, occurred_on: "2026-10-06", voids_entry_id: "3" },
          { id: "5", direction: "in", amount_kes: 5000, occurred_on: "2026-09-01" },
        ],
        today,
      ),
    ).toBe(7650);
  });
});
