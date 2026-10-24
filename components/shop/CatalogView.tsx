"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AISLES,
  SORTS,
  STORE_FILTERS,
  byPack,
  groupByItem,
  inAisle,
  inStoreFilter,
  matchesSearch,
  sortProducts,
  storePrices,
  tierOf,
  type Aisle,
  type Product,
  type Sort,
  type StoreFilter,
} from "@/lib/shopping/catalog";
import { BottomSheet } from "@/components/BottomSheet";
import { kes, storeName, storeTotals, type ListLine, type Store, type Tier } from "@/lib/shopping/pricing";
import type { ShoppingItem, StockItem } from "@/lib/shopping/shops";

const BATCH = 40;

const TIERS: { value: Tier; label: string }[] = [
  { value: "standard", label: "On the list" },
  { value: "qol", label: "✨ Wishlist" },
];
const TIER_FILTERS: { value: Tier | "all"; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "essential", label: "House basics" },
  { value: "standard", label: "Regular buys" },
  { value: "qol", label: "Nice to have" },
];

const perUnit = (p: Product) =>
  p.unit_price == null ? null : `${kes(p.unit_price)}/${p.normalized_unit === "kg" ? "kg" : p.normalized_unit === "liter" ? "L" : "pc"}`;

type Props = {
  products: Product[];
  stock: StockItem[];
  cart: ShoppingItem[]; // unbought list rows, including automatic Low / Out lines
  cartLines: ListLine[];
  history: { catalog_product_id?: string | null; item_id?: string | null }[]; // every list row ever, for "most bought"
  onAdd: (p: Product, tier: Tier) => void;
  onAddHouse: (s: StockItem) => void;
  onQty: (row: ShoppingItem, quantity: number) => void;
  onTier: (row: ShoppingItem, tier: Tier) => void;
  onViewCart: () => void;
};

// Catalog: browse and search every Naivas and Quickmart product offline, compare the two
// stores, and add to the family cart with a tier in one tap.
export function CatalogView({ products, stock, cart, cartLines, history, onAdd, onAddHouse, onQty, onTier, onViewCart }: Props) {
  const [query, setQuery] = useState("");
  const [aisle, setAisle] = useState<Aisle | null>(null);
  const [sort, setSort] = useState<Sort>("house");
  const [store, setStore] = useState<StoreFilter>("all");
  const [tier, setTier] = useState<Tier | "all">("all");
  const [grouped, setGrouped] = useState(true);
  const [shown, setShown] = useState(BATCH);
  const more = useRef<HTMLDivElement>(null);

  const onShelf = useMemo(() => products.filter((p) => p.in_stock !== false), [products]);
  // Naivas blocks price collection, so only Quickmart has prices today; Naivas options appear if that changes.
  const hasNaivas = useMemo(() => onShelf.some((p) => p.store === "naivas"), [onShelf]);
  const packs = useMemo(() => byPack(onShelf), [onShelf]);
  const houseConcepts = useMemo(() => new Set(stock.map((s) => s.canonical_concept).filter((c): c is string => !!c)), [stock]);
  const houseTier = useMemo(
    () => new Map(stock.filter((s) => s.canonical_concept).map((s) => [s.canonical_concept as string, (s.shopping_tier ?? "standard") as Tier])),
    [stock],
  );
  const houseCount = useMemo(() => {
    const byProduct = new Map<string, number>();
    const byConcept = new Map<string, number>();
    const conceptOf = new Map(stock.map((s) => [s.id, s.canonical_concept]));
    for (const h of history) {
      if (h.catalog_product_id) byProduct.set(h.catalog_product_id, (byProduct.get(h.catalog_product_id) ?? 0) + 1);
      const c = h.item_id ? conceptOf.get(h.item_id) : null;
      if (c) byConcept.set(c, (byConcept.get(c) ?? 0) + 1);
    }
    // Anything the house tracks counts once even before it's been bought through the app.
    return (p: Product) =>
      (byProduct.get(p.id) ?? 0) + (p.canonical_concept ? (byConcept.get(p.canonical_concept) ?? 0) + (houseConcepts.has(p.canonical_concept) ? 1 : 0) : 0);
  }, [history, stock, houseConcepts]);

  const results = useMemo(() => {
    const hits = onShelf.filter(
      (p) => inAisle(p, aisle, houseConcepts) && matchesSearch(p, query) && inStoreFilter(p, store, packs) && (tier === "all" || tierOf(p, houseTier) === tier),
    );
    return sortProducts(hits, sort, houseCount);
  }, [onShelf, aisle, houseConcepts, query, store, packs, tier, houseTier, sort, houseCount]);
  const cards = useMemo(() => (grouped ? groupByItem(results) : results.map((p) => ({ key: p.id, products: [p], cheapest: p }))), [grouped, results]);

  // Start again from the top whenever the filters change.
  useEffect(() => setShown(BATCH), [query, aisle, sort, store, tier, grouped]);
  // Load the next batch as the end of the list comes into view.
  useEffect(() => {
    const el = more.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && setShown((n) => n + BATCH), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [cards.length, shown]);

  const inCart = useMemo(() => new Map(cart.filter((r) => r.catalog_product_id).map((r) => [r.catalog_product_id as string, r])), [cart]);
  const market = aisle === "market" ? stock.filter((s) => s.category === "fresh_produce").filter((s) => matchesSearch({ title: s.name } as Product, query)) : [];

  const totals = storeTotals(cartLines, products as never);
  const priced = totals.filter((t) => t.priced > 0).sort((a, b) => a.total - b.total);
  const cartCount = cart.length;

  const select = "min-h-12 min-w-0 rounded-xl border border-line bg-raised px-2 text-sm";

  return (
    <>
      <div className="sticky top-[calc(env(safe-area-inset-top)+4.25rem)] z-[5] -mx-4 flex flex-col gap-2 bg-base px-4 pb-2 pt-1">
        <label htmlFor="catalog-search" className="sr-only">
          Search the catalog
        </label>
        <input
          id="catalog-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={onShelf.length ? `Search ${onShelf.length.toLocaleString("en-KE")} items, brands, sizes…` : "Search items, brands, sizes…"}
          autoComplete="off"
          className="min-h-12 rounded-xl border border-line bg-raised px-3"
        />
        <div role="group" aria-label="Aisles" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
          {AISLES.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={aisle === a.id}
              onClick={() => setAisle(aisle === a.id ? null : a.id)}
              className={`min-h-10 shrink-0 rounded-md border px-3 text-sm font-bold ${aisle === a.id ? "border-brand bg-brand text-brand-contrast" : "border-line bg-raised"}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={select}>
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select aria-label="Store" value={store} onChange={(e) => setStore(e.target.value as StoreFilter)} className={select}>
          {STORE_FILTERS.filter((s) => hasNaivas || !s.id.includes("naivas")).map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select aria-label="Tier" value={tier} onChange={(e) => setTier(e.target.value as Tier | "all")} className={select}>
          {TIER_FILTERS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <button type="button" aria-pressed={!grouped} onClick={() => setGrouped((g) => !g)} className={`${select} font-bold`}>
          {grouped ? "Show all brands" : "Group by item"}
        </button>
      </div>

      {products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-muted">
          Downloading the supermarket catalog. This happens once, the first time there&apos;s signal.
        </p>
      ) : aisle === "market" ? (
        <section className="rounded-2xl bg-raised p-4">
          <p className="text-sm text-muted">Market and mama mboga prices aren&apos;t online. Add from the house list:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {market.map((s) => {
              const added = cart.some((r) => r.item_id === s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={added}
                  onClick={() => onAddHouse(s)}
                  className="min-h-12 rounded-md border border-line px-4 disabled:border-transparent disabled:bg-ok-bg disabled:text-ok-fg"
                >
                  {added ? `✓ ${s.name}` : `+ ${s.name}`}
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <>
          <p className="text-sm text-muted">
            {results.length === 1 ? "1 item" : `${results.length.toLocaleString("en-KE")} items`}
            {grouped && cards.length !== results.length ? ` in ${cards.length === 1 ? "1 group" : `${cards.length.toLocaleString("en-KE")} groups`}` : ""}
          </p>
          <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
            {cards.slice(0, shown).map((c) => (
              <ProductCard
                key={c.key}
                product={c.cheapest}
                others={c.products.filter((p) => p !== c.cheapest)}
                packs={packs}
                inCart={inCart}
                tierFor={(p) => tierOf(p, houseTier)}
                onAdd={onAdd}
                onQty={onQty}
                onTier={onTier}
              />
            ))}
          </ul>
          {shown < cards.length && <div ref={more} className="h-12" aria-hidden="true" />}
          {results.length === 0 && <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-muted">Nothing matches. Try fewer words or another aisle.</p>}
        </>
      )}

      {cartCount > 0 && (
        <div className="fixed inset-x-0 z-20 px-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-6 lg:left-56">
          <button
            type="button"
            onClick={onViewCart}
            className="mx-auto flex min-h-14 w-full max-w-xl items-center justify-between gap-2 rounded-xl bg-brand px-4 text-left text-brand-contrast"
          >
            <span className="min-w-0 text-sm tabular">
              <strong>🛒 {cartCount === 1 ? "1 item" : `${cartCount} items`}</strong>
              {priced.map((t) => ` · ${storeName(t.store)} ${kes(t.total)}`).join("")}
              {priced.length === 2 && ` (save ${kes(priced[1].total - priced[0].total)})`}
            </span>
            <span className="shrink-0 font-bold">View the list →</span>
          </button>
        </div>
      )}
    </>
  );
}

type CardProps = {
  product: Product;
  others: Product[];
  packs: Map<string, Product[]>;
  inCart: Map<string, ShoppingItem>;
  tierFor: (p: Product) => Tier;
  onAdd: (p: Product, tier: Tier) => void;
  onQty: (row: ShoppingItem, quantity: number) => void;
  onTier: (row: ShoppingItem, tier: Tier) => void;
};

/** One product in the list: name and sale tag, its price, and Add. Tap for brands, tier and quantity. */
function ProductCard(props: CardProps) {
  const { product, others, inCart, tierFor, onAdd } = props;
  const [sheet, setSheet] = useState(false);
  const row = inCart.get(product.id);
  const per = perUnit(product);
  return (
    <li className="rounded-2xl bg-raised border border-line">
      <div className="flex items-center gap-3 p-4">
        <button type="button" onClick={() => setSheet(true)} className="min-w-0 flex-1 text-left">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold">{product.title}</span>
            {product.is_on_sale && <span className="rounded-md bg-ok-bg px-2 py-0.5 text-xs font-bold text-ok-fg">−{Math.round(product.discount_pct)}%</span>}
          </span>
          <span className="mt-0.5 block text-sm text-muted tabular">
            <strong className="text-ink">{kes(product.effective_price)}</strong> at {storeName(product.store)}
            {per ? ` · ${per}` : ""}
            {others.length ? ` · +${others.length} ${others.length === 1 ? "brand" : "brands"}` : ""}
          </span>
        </button>
        {row ? (
          <button type="button" onClick={() => setSheet(true)} className="min-h-12 shrink-0 rounded-xl border border-ok-fg px-3 font-bold text-ok-fg">
            ✓ On the list{Number(row.quantity ?? 1) > 1 ? ` ×${row.quantity}` : ""}
          </button>
        ) : (
          <button type="button" aria-label={`Add ${product.title}`} onClick={() => onAdd(product, tierFor(product))} className="min-h-12 shrink-0 rounded-xl bg-brand px-4 font-bold text-brand-contrast">
            + Add
          </button>
        )}
      </div>
      {sheet && (
        <BottomSheet title={product.title} onClose={() => setSheet(false)}>
          <ProductDetails {...props} />
        </BottomSheet>
      )}
    </li>
  );
}

// Everything about a product, in its sheet: both stores, tier, quantity, the other brands.
function ProductDetails({
  product,
  others,
  packs,
  inCart,
  tierFor,
  onAdd,
  onQty,
  onTier,
}: {
  product: Product;
  others: Product[];
  packs: Map<string, Product[]>;
  inCart: Map<string, ShoppingItem>;
  tierFor: (p: Product) => Tier;
  onAdd: (p: Product, tier: Tier) => void;
  onQty: (row: ShoppingItem, quantity: number) => void;
  onTier: (row: ShoppingItem, tier: Tier) => void;
}) {
  const [open, setOpen] = useState(false);
  const prices = storePrices(product, packs);
  const both = prices.naivas && prices.quickmart;
  const winner: Store | null = both ? (prices.naivas!.effective_price <= prices.quickmart!.effective_price ? "naivas" : "quickmart") : null;
  const row = inCart.get(product.id);

  return (
    <div className="pt-1">
      <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
        {product.brand && <span className="rounded-md bg-base px-2 py-0.5">{product.brand}</span>}
        {product.pack_size_label && <span className="rounded-md border border-line px-2 py-0.5">{product.pack_size_label}</span>}
        {product.is_on_sale && <span className="rounded-md bg-ok-bg px-2 py-0.5 text-ok-fg">−{Math.round(product.discount_pct)}% off</span>}
      </div>
      <h3 className="mt-1 font-bold">{product.title}</h3>

      <div className={`mt-2 grid gap-2 text-sm tabular ${both ? "grid-cols-2" : "grid-cols-1"}`}>
        {(["naivas", "quickmart"] as Store[]).map((s) => {
          const p = prices[s];
          if (!p) return null;
          return (
            <div key={s} className={`rounded-lg px-2 py-1.5 ${winner === s ? "bg-ok-bg text-ok-fg" : "bg-base"}`}>
              <span className="block text-xs font-bold">
                {storeName(s)}
                {winner === s && " · cheaper"}
              </span>
              <strong>{kes(p.effective_price)}</strong>
              {p.is_on_sale && p.sale_price != null && <span className="ml-1 text-muted line-through">{kes(p.regular_price)}</span>}
              {perUnit(p) && <span className="block text-xs text-muted">{perUnit(p)}</span>}
            </div>
          );
        })}
      </div>

      {row ? (
        <div className="mt-3 flex flex-col gap-2">
          <div role="radiogroup" aria-label={`List or wishlist for ${product.title}`} className="grid grid-cols-2 gap-1">
            {TIERS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="radio"
                aria-checked={(row.shopping_tier === "qol" ? "qol" : "standard") === t.value}
                onClick={() => onTier(row, t.value)}
                className={`min-h-12 rounded-xl border text-xs font-bold ${(row.shopping_tier === "qol" ? "qol" : "standard") === t.value ? "border-brand bg-brand text-brand-contrast" : "border-line"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-ok-fg">✓ On the list</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={`One fewer ${product.title}`}
                onClick={() => onQty(row, Number(row.quantity ?? 1) - 1)}
                className="flex size-12 items-center justify-center rounded-xl border border-line bg-base text-xl font-bold"
              >
                −
              </button>
              <span className="min-w-8 text-center font-bold tabular" aria-live="polite">
                {Number(row.quantity ?? 1)}
              </span>
              <button
                type="button"
                aria-label={`One more ${product.title}`}
                onClick={() => onQty(row, Number(row.quantity ?? 1) + 1)}
                className="flex size-12 items-center justify-center rounded-xl border border-line bg-base text-xl font-bold"
              >
                +
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" aria-label={`Add ${product.title}`} onClick={() => onAdd(product, tierFor(product))} className="mt-3 min-h-12 w-full rounded-xl bg-brand font-bold text-brand-contrast">
          + Add
        </button>
      )}

      {others.length > 0 && (
        <>
          <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="mt-2 min-h-10 text-sm font-bold text-brand">
            {open ? "Hide other brands" : `${others.length} more ${others.length === 1 ? "brand" : "brands"} in this size`}
          </button>
          {open && (
            <ul className="mt-1 divide-y divide-line rounded-xl border border-line">
              {others.map((o) => {
                const added = inCart.has(o.id);
                return (
                  <li key={o.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm tabular">
                    <span className="min-w-0">
                      {o.title}
                      <span className="block text-muted">
                        {storeName(o.store)} · {kes(o.effective_price)}
                        {o.is_on_sale && <span className="text-ok-fg"> −{Math.round(o.discount_pct)}%</span>}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={added}
                      aria-label={added ? `${o.title} is on the list` : `Add ${o.title}`}
                      onClick={() => onAdd(o, tierFor(o))}
                      className="min-h-12 shrink-0 rounded-xl border border-line px-3 font-bold text-brand disabled:text-ok-fg"
                    >
                      {added ? "✓ Added" : "+ Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
