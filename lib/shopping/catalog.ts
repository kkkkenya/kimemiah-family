// The supermarket catalog on the phone: search, aisles, sorting, store filters and
// Naivas vs Quickmart pairing. Pure functions over the offline copy, so all of it works with no signal.

import type { CatalogMatch, Store, Tier } from "./pricing";

export type Product = CatalogMatch & {
  category_group: string;
  default_tier?: Tier;
  in_stock?: boolean;
};

// ---------------------------------------------------------------- aisles

export type Aisle = "sale" | "usuals" | "staples" | "dairy" | "liquor" | "drinks" | "cleaning" | "toiletries" | "home" | "market";

export const AISLES: { id: Aisle; label: string }[] = [
  { id: "sale", label: "🔥 On sale" },
  { id: "usuals", label: "⭐ House usuals" },
  { id: "staples", label: "🌾 Unga, rice & oil" },
  { id: "dairy", label: "🥛 Dairy, bread & eggs" },
  { id: "liquor", label: "🍷 Liquor & alcohol" },
  { id: "drinks", label: "🧃 Tea, coffee & drinks" },
  { id: "cleaning", label: "🧼 Cleaning & laundry" },
  { id: "toiletries", label: "🧻 Toiletries & care" },
  { id: "home", label: "🪣 Home & upgrades" },
  { id: "market", label: "🥬 Market & mama mboga" },
];

const AISLE_GROUP: Partial<Record<Aisle, string>> = {
  staples: "food_cupboard",
  dairy: "dairy_bakery",
  liquor: "liquor_alcohol",
  drinks: "beverages",
  cleaning: "cleaning_laundry",
  toiletries: "toiletries",
  home: "home_qol",
};

/** Market produce isn't sold online; that aisle lists the house's own market items instead. */
export function inAisle(p: Product, aisle: Aisle | null, houseConcepts: Set<string>): boolean {
  if (!aisle) return true;
  if (aisle === "sale") return p.is_on_sale;
  if (aisle === "usuals") return !!p.canonical_concept && houseConcepts.has(p.canonical_concept);
  if (aisle === "market") return false;
  return p.category_group === AISLE_GROUP[aisle];
}

// ---------------------------------------------------------------- search

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase();

/** Every word must appear in the title, brand or pack size: "oil 2l", "tusker can". */
export function matchesSearch(p: Product, query: string): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${norm(p.title)} ${norm(p.brand)} ${norm(p.pack_size_label)}`;
  return words.every((w) => hay.includes(w));
}

// ---------------------------------------------------------------- the other store

const otherStore = (s: Store): Store => (s === "naivas" ? "quickmart" : "naivas");
const sameBrand = (a: string | null, b: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
const price = (p: Product) => Number(p.effective_price);

/** Index of in-stock products by exact pack (canonical_group_key). */
export function byPack(products: Product[]): Map<string, Product[]> {
  const map = new Map<string, Product[]>();
  for (const p of products) {
    if (p.in_stock === false || !p.canonical_group_key) continue;
    const list = map.get(p.canonical_group_key);
    if (list) list.push(p);
    else map.set(p.canonical_group_key, [p]);
  }
  return map;
}

/** The same product at the other store: same pack and brand, cheapest first. */
export function counterpart(p: Product, packs: Map<string, Product[]>): Product | null {
  if (!p.canonical_group_key) return null;
  const other = otherStore(p.store);
  const same = (packs.get(p.canonical_group_key) ?? []).filter((o) => o.store === other && sameBrand(o.brand, p.brand));
  return same.length ? same.reduce((a, b) => (price(b) < price(a) ? b : a)) : null;
}

/** Prices for one card: this product, and the matching one at the other store. */
export function storePrices(p: Product, packs: Map<string, Product[]>): Partial<Record<Store, Product>> {
  const twin = counterpart(p, packs);
  return { [p.store]: p, ...(twin ? { [twin.store]: twin } : {}) };
}

// ---------------------------------------------------------------- grouping

export type Group = { key: string; products: Product[]; cheapest: Product };

/** "Group by item": one card per exact pack, every brand inside; items with no known pack stay on their own. */
export function groupByItem(products: Product[]): Group[] {
  const groups = new Map<string, Product[]>();
  for (const p of products) {
    const key = p.canonical_group_key ?? `id:${p.id}`;
    const list = groups.get(key);
    if (list) list.push(p);
    else groups.set(key, [p]);
  }
  return [...groups].map(([key, list]) => ({ key, products: list, cheapest: list.reduce((a, b) => (price(b) < price(a) ? b : a)) }));
}

// ---------------------------------------------------------------- sort and filter

export type Sort = "value" | "savings" | "price" | "house" | "az";

export const SORTS: { id: Sort; label: string }[] = [
  { id: "house", label: "House usuals first" },
  { id: "value", label: "Best value (per kg / L / piece)" },
  { id: "savings", label: "Biggest savings (% off)" },
  { id: "price", label: "Lowest price" },
  { id: "az", label: "A to Z" },
];

export function sortProducts(products: Product[], sort: Sort, houseCount: (p: Product) => number = () => 0): Product[] {
  const list = [...products];
  const unit = (p: Product) => (p.unit_price == null ? Infinity : Number(p.unit_price));
  switch (sort) {
    case "value":
      return list.sort((a, b) => unit(a) - unit(b) || price(a) - price(b));
    case "savings":
      return list.sort((a, b) => Number(b.discount_pct) - Number(a.discount_pct) || price(a) - price(b));
    case "price":
      return list.sort((a, b) => price(a) - price(b));
    case "house":
      return list.sort((a, b) => houseCount(b) - houseCount(a) || unit(a) - unit(b));
    case "az":
      return list.sort((a, b) => a.title.localeCompare(b.title));
  }
}

export type StoreFilter = "all" | "naivas_deals" | "quickmart_deals" | "cheaper_naivas" | "cheaper_quickmart";

export const STORE_FILTERS: { id: StoreFilter; label: string }[] = [
  { id: "all", label: "All stores" },
  { id: "naivas_deals", label: "Naivas deals" },
  { id: "quickmart_deals", label: "Quickmart deals" },
  { id: "cheaper_naivas", label: "Cheaper at Naivas" },
  { id: "cheaper_quickmart", label: "Cheaper at Quickmart" },
];

export function inStoreFilter(p: Product, filter: StoreFilter, packs: Map<string, Product[]>): boolean {
  switch (filter) {
    case "all":
      return true;
    case "naivas_deals":
      return p.store === "naivas" && p.is_on_sale;
    case "quickmart_deals":
      return p.store === "quickmart" && p.is_on_sale;
    case "cheaper_naivas":
    case "cheaper_quickmart": {
      const want: Store = filter === "cheaper_naivas" ? "naivas" : "quickmart";
      const twin = counterpart(p, packs);
      return p.store === want && !!twin && price(p) < price(twin);
    }
  }
}

/** The tier a product goes into the cart with: the house item's tier if the family tracks it, else the catalog default. */
export function tierOf(p: Product, houseTier: Map<string, Tier>): Tier {
  return (p.canonical_concept && houseTier.get(p.canonical_concept)) || p.default_tier || "standard";
}
