import { describe, expect, it } from "vitest";
import { essentialsNeeded, supperCount } from "@/lib/home";
import type { CatalogMatch } from "./pricing";
import { likelyLow, upgradeDeals, usualDays } from "./predict";
import type { Movement } from "./stock";

const NOW = Date.parse("2026-10-22T09:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86400_000).toISOString();
const put = (item: string, d: number): Movement => ({ id: `${item}-${d}`, item_id: item, delta: 1, reason: "put_away", created_at: daysAgo(d) });

describe("running-low predictor", () => {
  // Oil restocked 36, 24 and 12 days ago: it usually lasts 12 days.
  const oil = [put("oil", 36), put("oil", 24), put("oil", 12)];

  it("learns how long an item lasts from its last restocks", () => {
    expect(usualDays("oil", oil)).toBe(12);
    expect(usualDays("oil", oil.slice(1))).toBeNull(); // needs 3 restocks
    expect(usualDays("oil", [...oil, { ...put("oil", 12), id: "same-day" }])).toBe(12); // same day counts once
  });

  it("asks after 80% of the usual time, unless someone said Still OK lately", () => {
    const restocked9 = [put("oil", 33), put("oil", 21), put("oil", 9)];
    expect(likelyLow("oil", restocked9, NOW)).toBe(false); // 9 of 12 days
    const restocked10 = [put("oil", 34), put("oil", 22), put("oil", 10)];
    expect(likelyLow("oil", restocked10, NOW)).toBe(true); // 10 of 12 days
    expect(likelyLow("oil", restocked10, NOW, NOW - 86400_000)).toBe(false);
    expect(likelyLow("oil", restocked10, NOW, NOW - 4 * 86400_000)).toBe(true);
  });
});

describe("upgrade deals", () => {
  const p = (o: Partial<CatalogMatch> & { id: string }): CatalogMatch =>
    ({ store: "quickmart", title: o.id, brand: null, canonical_group_key: null, canonical_concept: null, pack_size_label: null, normalized_qty: null, normalized_unit: null, regular_price: 100, sale_price: null, effective_price: 100, discount_pct: 0, unit_price: null, is_on_sale: false, ...o }) as CatalogMatch;
  const products = [
    p({ id: "bucket20", canonical_concept: "bucket", is_on_sale: true, discount_pct: 20 }),
    p({ id: "mop1", canonical_concept: "mop", is_on_sale: true, discount_pct: 8 }),
  ];

  it("flags can-wait items with a 12%+ deal on the same kind of thing", () => {
    const cart = [
      { id: "a", title: "Bucket", shopping_tier: "qol", concept: "bucket" },
      { id: "b", title: "Mop", shopping_tier: "qol", catalog_product_id: "mop1" },
      { id: "c", title: "Bucket", shopping_tier: "standard", concept: "bucket" },
    ];
    expect(upgradeDeals(cart, products).map((d) => [d.line.id, d.deal.id])).toEqual([["a", "bucket20"]]);
  });
});

describe("home", () => {
  it("counts who's home for supper tonight", () => {
    const people = [
      { id: "j", name: "Juliet", sort: 1, presence: "at_home" },
      { id: "p", name: "Peter", sort: 2, is_remote: true },
      { id: "w", name: "Wanini", sort: 3, presence: "out" },
      { id: "d", name: "Daniel", sort: 4, presence: "away" },
      { id: "v", name: "Vinnie", sort: 5, presence: "at_home", eating_out_on: "2026-10-22" },
      { id: "g", name: "Greg", sort: 6, presence: "at_home", eating_out_on: "2026-10-21" },
    ];
    const c = supperCount(people, NOW);
    expect([c.eating, c.total, c.out]).toEqual([3, 4, ["Vinnie"]]);
  });

  it("lists essentials that are Out or Low, Out first", () => {
    const s = (o: object) => ({ actor_id: "x", track_mode: "count" as const, min_qty: 1, ...o });
    const stock = [
      s({ id: "1", name: "Sugar", shopping_tier: "essential", have_qty: 1 }),
      s({ id: "2", name: "Unga", shopping_tier: "essential", have_qty: 0 }),
      s({ id: "3", name: "Tea", shopping_tier: "standard", have_qty: 0 }),
      s({ id: "4", name: "Oil", shopping_tier: "essential", have_qty: 5 }),
      { id: "5", name: "Milk", shopping_tier: "essential", have_qty: 0, min_qty: 1, actor_id: null },
    ];
    expect(essentialsNeeded(stock as never).map((x: { name: string }) => x.name)).toEqual(["Unga", "Sugar"]);
  });
});
