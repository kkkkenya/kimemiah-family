import { describe, expect, it } from "vitest";
import {
  byPack,
  counterpart,
  groupByItem,
  inAisle,
  inStoreFilter,
  matchesSearch,
  sortProducts,
  storePrices,
  tierOf,
  type Product,
} from "./catalog";

const p = (o: Partial<Product> & Pick<Product, "id" | "store" | "effective_price">): Product => ({
  title: `${o.brand ?? "X"} Cooking Oil 2L`,
  brand: "X",
  category_group: "food_cupboard",
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
  in_stock: true,
  ...o,
});

const rinaQ = p({ id: "rq", store: "quickmart", brand: "Rina", effective_price: 560 });
const rinaN = p({ id: "rn", store: "naivas", brand: "Rina", effective_price: 545, is_on_sale: true, discount_pct: 8 });
const friQ = p({ id: "fq", store: "quickmart", brand: "Fresh Fri", effective_price: 520 });
const tusker = p({ id: "t", store: "quickmart", brand: "Tusker", title: "Tusker Lager Can 500Ml", category_group: "liquor_alcohol", canonical_group_key: "lager-beer-500ml", canonical_concept: "lager-beer", pack_size_label: "500ML", effective_price: 250, unit_price: 500 });
const all = [rinaQ, rinaN, friQ, tusker];

describe("search", () => {
  it("needs every word, in the title, brand or size", () => {
    expect(all.filter((x) => matchesSearch(x, "rina 2l")).map((x) => x.id)).toEqual(["rq", "rn"]);
    expect(all.filter((x) => matchesSearch(x, "tusker can")).map((x) => x.id)).toEqual(["t"]);
    expect(all.filter((x) => matchesSearch(x, "  ")).length).toBe(4);
  });
});

describe("aisles", () => {
  const house = new Set(["cooking-oil"]);
  it("filters by sale, house usuals and department", () => {
    expect(all.filter((x) => inAisle(x, "sale", house)).map((x) => x.id)).toEqual(["rn"]);
    expect(all.filter((x) => inAisle(x, "usuals", house)).map((x) => x.id)).toEqual(["rq", "rn", "fq"]);
    expect(all.filter((x) => inAisle(x, "liquor", house)).map((x) => x.id)).toEqual(["t"]);
    expect(all.filter((x) => inAisle(x, "market", house))).toEqual([]);
  });
});

describe("the other store", () => {
  const packs = byPack(all);
  it("pairs the same brand and pack across stores", () => {
    expect(counterpart(rinaQ, packs)?.id).toBe("rn");
    expect(counterpart(friQ, packs)).toBeNull(); // Fresh Fri isn't priced at Naivas
    expect(storePrices(rinaQ, packs)).toEqual({ quickmart: rinaQ, naivas: rinaN });
  });

  it("filters deals and where it's cheaper", () => {
    expect(all.filter((x) => inStoreFilter(x, "naivas_deals", packs)).map((x) => x.id)).toEqual(["rn"]);
    expect(all.filter((x) => inStoreFilter(x, "cheaper_naivas", packs)).map((x) => x.id)).toEqual(["rn"]);
    expect(all.filter((x) => inStoreFilter(x, "cheaper_quickmart", packs))).toEqual([]);
  });

  it("ignores products that left the shelf", () => {
    const gone = { ...rinaN, in_stock: false };
    expect(counterpart(rinaQ, byPack([rinaQ, gone]))).toBeNull();
  });
});

describe("grouping and sorting", () => {
  it("groups brands of the same pack into one card", () => {
    const groups = groupByItem(all);
    expect(groups.map((g) => [g.key, g.products.length, g.cheapest.id])).toEqual([
      ["cooking-oil-2l", 3, "fq"],
      ["lager-beer-500ml", 1, "t"],
    ]);
  });

  it("sorts by value, savings, price, house use and name", () => {
    expect(sortProducts(all, "value").map((x) => x.id)).toEqual(["fq", "rn", "rq", "t"]);
    expect(sortProducts(all, "savings")[0].id).toBe("rn");
    expect(sortProducts(all, "price").map((x) => x.id)).toEqual(["t", "fq", "rn", "rq"]);
    expect(sortProducts(all, "house", (x) => (x.id === "t" ? 5 : 0))[0].id).toBe("t");
    expect(sortProducts(all, "az")[0].id).toBe("fq");
  });
});

describe("tierOf", () => {
  it("uses the house item's tier first, then the catalog default", () => {
    expect(tierOf({ ...rinaQ, default_tier: "standard" }, new Map([["cooking-oil", "essential"]]))).toBe("essential");
    expect(tierOf({ ...tusker, default_tier: "standard" }, new Map())).toBe("standard");
    expect(tierOf({ ...tusker, default_tier: undefined }, new Map())).toBe("standard");
  });
});
