// Price logic for the shopping list. Pure functions over this phone's offline data,
// so everything here works with no signal inside the supermarket.

export type Tier = "essential" | "standard" | "qol";
export type Store = "naivas" | "quickmart";
export type Flex = "any_cheapest" | "prefer_named" | "strict_named";

export type CatalogMatch = {
  id: string;
  store: Store;
  title: string;
  brand: string | null;
  canonical_group_key: string | null;
  canonical_concept: string | null;
  pack_size_label: string | null;
  normalized_qty: number | null;
  normalized_unit: "kg" | "liter" | "unit" | null;
  regular_price: number;
  sale_price: number | null;
  effective_price: number;
  discount_pct: number;
  unit_price: number | null;
  is_on_sale: boolean;
};

export type StockLike = {
  id: string;
  name: string;
  shopping_tier?: Tier;
  is_fast_mover?: boolean;
  canonical_group_key?: string | null;
  canonical_concept?: string | null;
  preferred_brand?: string | null;
  brand_flexibility?: Flex;
  usual_price_kes?: number | null;
  track_mode?: "count" | "level";
  level?: "ok" | "low" | "out";
  have_qty?: number;
  min_qty?: number;
  updated_at?: string;
  deleted_at?: string | null;
  actor_id?: string | null; // null until someone in the family has updated it
};

/** Starter rows nobody has counted yet: their status is unknown, not "out". */
export const isCounted = (s: StockLike) => Boolean(s.actor_id);

export type ListLine = {
  id: string;
  title: string;
  shopping_tier?: Tier;
  catalog_product_id?: string | null;
  quantity?: number; // how many to buy; totals multiply by it
  item?: StockLike; // the stock item it came from, if any
};

const qtyOf = (l: ListLine) => (Number(l.quantity) > 0 ? Number(l.quantity) : 1);

// ---------------------------------------------------------------- modes

export type Mode = { base: "essential" | "full"; upgrades: boolean };

export function inMode(tier: Tier | undefined, mode: Mode): boolean {
  const t = tier ?? "standard";
  if (t === "qol") return mode.upgrades;
  if (t === "standard") return mode.base === "full";
  return true;
}

// ---------------------------------------------------------------- stock status

export type Status = "ok" | "low" | "out";

export function stockStatus(s: StockLike): Status {
  if (s.track_mode === "level") return s.level ?? "ok";
  const have = Number(s.have_qty ?? 0);
  const min = Number(s.min_qty ?? 0);
  if (min <= 0) return "ok";
  if (have <= 0) return "out";
  return have <= min ? "low" : "ok";
}

// ---------------------------------------------------------------- price options

const num = (n: unknown) => Number(n ?? 0);

/** Exact-pack options for a line (same canonical key), cheapest first. */
export function optionsFor(line: ListLine, matches: CatalogMatch[]): CatalogMatch[] {
  if (line.catalog_product_id) {
    const linked = matches.find((m) => m.id === line.catalog_product_id);
    const key = linked?.canonical_group_key;
    const same = key ? matches.filter((m) => m.canonical_group_key === key) : linked ? [linked] : [];
    return [...same].sort((a, b) => num(a.effective_price) - num(b.effective_price));
  }
  const key = line.item?.canonical_group_key;
  if (!key) return [];
  return matches.filter((m) => m.canonical_group_key === key).sort((a, b) => num(a.effective_price) - num(b.effective_price));
}

/** Every pack size in the same product family, cheapest per kg / litre / unit first. */
export function familyFor(line: ListLine, matches: CatalogMatch[]): CatalogMatch[] {
  const concept =
    line.item?.canonical_concept ?? matches.find((m) => m.id === line.catalog_product_id)?.canonical_concept ?? null;
  if (!concept) return [];
  return matches
    .filter((m) => m.canonical_concept === concept)
    .sort((a, b) => num(a.unit_price ?? Infinity) - num(b.unit_price ?? Infinity));
}

const sameBrand = (a: string | null, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** The option to buy under the family's brand rules, optionally limited to one store. */
export function pick(line: ListLine, options: CatalogMatch[], store?: Store): CatalogMatch | null {
  const flex = line.item?.brand_flexibility ?? "any_cheapest";
  const preferred = line.item?.preferred_brand;
  let pool = store ? options.filter((o) => o.store === store) : options;
  if (flex !== "any_cheapest" && preferred) {
    const named = pool.filter((o) => sameBrand(o.brand, preferred));
    if (named.length || flex === "strict_named") pool = named;
  }
  return pool.length ? pool.reduce((a, b) => (num(b.effective_price) < num(a.effective_price) ? b : a)) : null;
}

/** For "prefer a brand": a rival brand at least 12% off. */
export function rivalDeal(line: ListLine, options: CatalogMatch[]): CatalogMatch | null {
  const preferred = line.item?.preferred_brand;
  if (line.item?.brand_flexibility !== "prefer_named" || !preferred) return null;
  return options.find((o) => !sameBrand(o.brand, preferred) && num(o.discount_pct) >= 12) ?? null;
}

/** A bigger pack (up to 3x the usual size, so no 20 L jerrycans) that is 8%+ cheaper per kg / litre / unit. */
export function bulkValue(line: ListLine, matches: CatalogMatch[]): { option: CatalogMatch; savingPct: number } | null {
  const best = pick(line, optionsFor(line, matches));
  if (!best?.unit_price || !best.normalized_qty) return null;
  const cheaper = familyFor(line, matches).find(
    (m) =>
      m.unit_price &&
      m.normalized_unit === best.normalized_unit &&
      num(m.normalized_qty) > num(best.normalized_qty) &&
      num(m.normalized_qty) <= num(best.normalized_qty) * 3 &&
      num(m.unit_price) <= num(best.unit_price) * 0.92,
  );
  if (!cheaper) return null;
  return { option: cheaper, savingPct: Math.round((1 - num(cheaper.unit_price) / num(best.unit_price)) * 100) };
}

/** Price used for totals: catalog pick if we have one, else the family's usual price. */
export function linePrice(line: ListLine, matches: CatalogMatch[], store?: Store): number | null {
  const chosen = pick(line, optionsFor(line, matches), store);
  if (chosen) return num(chosen.effective_price);
  return line.item?.usual_price_kes ? num(line.item.usual_price_kes) : null;
}

export function estimate(lines: ListLine[], matches: CatalogMatch[]): { total: number; unpriced: number } {
  let total = 0;
  let unpriced = 0;
  for (const l of lines) {
    const p = linePrice(l, matches);
    if (p == null) unpriced++;
    else total += p * qtyOf(l);
  }
  return { total, unpriced };
}

// ---------------------------------------------------------------- store comparison

export type StoreTotal = { store: Store; total: number; priced: number; missing: number; deals: number; saves: number };

export function storeTotals(lines: ListLine[], matches: CatalogMatch[]): StoreTotal[] {
  return (["naivas", "quickmart"] as Store[]).map((store) => {
    const t: StoreTotal = { store, total: 0, priced: 0, missing: 0, deals: 0, saves: 0 };
    for (const l of lines) {
      const options = optionsFor(l, matches);
      if (!options.length) continue; // not a supermarket item we have prices for
      const o = pick(l, options, store);
      if (!o) {
        t.missing++;
        continue;
      }
      t.total += num(o.effective_price) * qtyOf(l);
      t.priced++;
      if (o.is_on_sale && o.sale_price != null) {
        t.deals++;
        t.saves += (num(o.regular_price) - num(o.sale_price)) * qtyOf(l);
      }
    }
    return t;
  });
}

/** Buy each item at whichever store is cheaper; worth showing only if it beats one store by the threshold. */
export function smartSplit(lines: ListLine[], matches: CatalogMatch[], threshold = 300) {
  const comparable = lines.filter((l) => {
    const o = optionsFor(l, matches);
    return pick(l, o, "naivas") && pick(l, o, "quickmart");
  });
  if (comparable.length < 2) return null;
  let naivas = 0;
  let quickmart = 0;
  let split = 0;
  const atNaivas: string[] = [];
  const atQuickmart: string[] = [];
  for (const l of comparable) {
    const o = optionsFor(l, matches);
    const n = num(pick(l, o, "naivas")!.effective_price) * qtyOf(l);
    const q = num(pick(l, o, "quickmart")!.effective_price) * qtyOf(l);
    naivas += n;
    quickmart += q;
    split += Math.min(n, q);
    (n <= q ? atNaivas : atQuickmart).push(l.title);
  }
  const saving = Math.min(naivas, quickmart) - split;
  return saving >= threshold ? { saving, atNaivas, atQuickmart } : null;
}

// ---------------------------------------------------------------- anti-kiosk and deals

const DAY = 24 * 60 * 60 * 1000;

/** Fast movers that are Low or Out, or nobody has checked for 5+ days. */
export function runningLow(stock: StockLike[], now = Date.now()): { item: StockLike; reason: "low" | "out" | "unchecked" }[] {
  return stock
    .filter((s) => s.is_fast_mover && !s.deleted_at)
    .map((item) => {
      if (!isCounted(item)) return { item, reason: "unchecked" as const };
      const status = stockStatus(item);
      if (status !== "ok") return { item, reason: status };
      const checked = item.updated_at ? Date.parse(item.updated_at) : 0;
      return now - checked >= 5 * DAY ? { item, reason: "unchecked" as const } : null;
    })
    .filter((x): x is { item: StockLike; reason: "low" | "out" | "unchecked" } => x !== null);
}

/** Tracked staples that are fine at home but at least 15% off this week. */
export function dealRestock(stock: StockLike[], matches: CatalogMatch[]): { item: StockLike; deal: CatalogMatch }[] {
  const out: { item: StockLike; deal: CatalogMatch }[] = [];
  for (const item of stock) {
    if (item.deleted_at || !item.canonical_concept || !isCounted(item) || stockStatus(item) !== "ok") continue;
    const deal = matches
      .filter((m) => m.canonical_concept === item.canonical_concept && m.is_on_sale && num(m.discount_pct) >= 15)
      .sort((a, b) => num(b.discount_pct) - num(a.discount_pct))[0];
    if (deal) out.push({ item, deal });
  }
  return out;
}

// ---------------------------------------------------------------- money

export type MoneyEntry = { id: string; direction: "in" | "out"; amount_kes: number; occurred_on: string; voids_entry_id?: string | null; deleted_at?: string | null };

/** Money in minus money out this month, ignoring corrected entries and their corrections. */
export function moneyLeftThisMonth(entries: MoneyEntry[], today = new Date()): number | null {
  const month = today.toISOString().slice(0, 7);
  const voided = new Set(entries.map((e) => e.voids_entry_id).filter(Boolean));
  const live = entries.filter((e) => !e.deleted_at && !e.voids_entry_id && !voided.has(e.id) && e.occurred_on.startsWith(month));
  if (!live.some((e) => e.direction === "in")) return null;
  return live.reduce((sum, e) => sum + (e.direction === "in" ? 1 : -1) * num(e.amount_kes), 0);
}

export const kes = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;
export const storeName = (s: Store) => (s === "naivas" ? "Naivas" : "Quickmart");
