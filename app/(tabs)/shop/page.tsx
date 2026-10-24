"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Screen } from "@/components/Screen";
import { useSync } from "@/components/SyncProvider";
import { UndoBar, type UndoState } from "@/components/UndoBar";
import { CatalogView } from "@/components/shop/CatalogView";
import { DealRestock } from "@/components/shop/DealRestock";
import { AddEarlier, PastShops } from "@/components/shop/PastShops";
import { PlaceCatalog } from "@/components/shop/PlaceCatalog";
import { ShopList } from "@/components/shop/ShopList";
import { StoreCompare } from "@/components/shop/StoreCompare";
import { PLACES, placeOf, type PlaceId, type Trip, type TripLine } from "@/lib/shopping/market";
import { type CatalogMatch, type MoneyEntry, type StockLike, type Tier } from "@/lib/shopping/pricing";
import { type ShoppingItem, type StockItem } from "@/lib/shopping/shops";
import type { Product } from "@/lib/shopping/catalog";
import { autoListItems } from "@/lib/shopping/stock";
import { flexSummary, type Kind } from "@/lib/money/flex";
import type { Budget, Entry } from "@/lib/money/money";
import { useStock } from "@/lib/shopping/useStock";
import { localDB, syncEngine } from "@/lib/sync/client";
import { useRows } from "@/lib/sync/hooks";

type Item = ShoppingItem & { urgent?: boolean };
const NONE: never[] = [];
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const VIEW_KEY = "kimemiah-shop-view";
type View = "list" | "catalog" | "past";
const VIEWS: { id: View; label: string }[] = [
  { id: "list", label: "List" },
  { id: "catalog", label: "Catalog" },
  { id: "past", label: "Past shops" },
];

// Shop tab: the List (what the house needs, by place), the supermarket Catalog, and Past shops.
// The basket you fill while out shopping is its own page (/shop/basket).
export default function ShopPage() {
  const { syncNow } = useSync();
  const [view, setViewState] = useState<View>("list");
  const [undo, setUndo] = useState<UndoState>(null);
  const [place, setPlace] = useState<PlaceId>("supermarket");
  const closeUndo = useCallback(() => setUndo(null), []);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const v = q.get("view") ?? localStorage.getItem(VIEW_KEY);
      if (v === "catalog" || v === "past" || v === "list") setViewState(v);
      if (q.get("done")) setUndo({ id: Date.now(), message: "Shop saved · Money, Stock and the list are updated" });
    } catch {}
  }, []);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const { me, shops, stock, members } = useStock();
  const items = (useRows<Item>("shopping_extras") ?? NONE) as Item[];
  const trips = (useRows<Trip & { id: string }>("shopping_trips") ?? []) as Trip[];
  const tripLines = (useRows<TripLine>("trip_lines") ?? []) as TripLine[];
  const money = useRows<MoneyEntry & { id: string }>("money_entries") ?? [];
  // Every list row ever (removed ones too), for "Most bought by the house".
  const history = useLiveQuery(() => localDB().rows("shopping_extras").toArray(), [], []) as ShoppingItem[];
  const products = (useLiveQuery(() => localDB().catalog.toArray(), [], NONE) ?? NONE) as unknown as Product[];

  // Low / Out items join the list on their own until they're bought.
  const auto = useMemo<Item[]>(
    () =>
      autoListItems(stock as (StockItem & StockLike)[], items).map((s) => ({ id: `auto:${s.id}`, title: s.name, qty: null, shop_id: s.shop_id, item_id: s.id, bought_at: null, shopping_tier: s.shopping_tier === "qol" ? "qol" : "standard", auto: true })),
    [stock, items],
  );
  const cart = useMemo(() => [...auto, ...items.filter((i) => !i.bought_at)], [auto, items]);
  const stockById = useMemo(() => new Map(stock.map((s) => [s.id, s])), [stock]);
  const cartLines = cart.map((i) => ({ id: i.id, title: i.title, shopping_tier: i.shopping_tier, catalog_product_id: i.catalog_product_id, quantity: i.quantity, item: i.item_id ? (stockById.get(i.item_id) as StockLike | undefined) : undefined }));
  // Price only what's on the list or tracked at home, not all ~7,000 products.
  const matches = useMemo(() => {
    const concepts = new Set(stock.map((s) => s.canonical_concept).filter(Boolean));
    const linked = new Set(items.map((i) => i.catalog_product_id).filter(Boolean));
    return products.filter((p) => p.in_stock !== false && (linked.has(p.id) || (p.canonical_concept && concepts.has(p.canonical_concept))));
  }, [products, stock, items]) as CatalogMatch[];

  // Food and market budget left this month (flex budgeting), when one is set.
  const kinds = (useRows<Kind & { id: string }>("budget_categories") ?? []) as Kind[];
  const budgets = (useRows<Budget & { id: string }>("budgets") ?? []) as Budget[];
  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const foodRows = flexSummary(kinds, budgets, money as unknown as Entry[], today.slice(0, 7), today).rows.filter((r) => ["Food", "Market and fresh"].includes(r.kind.name) && r.available > 0);
  const foodLeft = foodRows.length ? foodRows.reduce((s, r) => s + r.left, 0) : null;

  const change = async (op: "insert" | "update" | "delete", row: Partial<Item> & { id: string }) => {
    await syncEngine().queue("shopping_extras", op, row);
    void syncNow();
  };
  const onList = (name: string, itemId?: string) => cart.some((i) => (itemId && i.item_id === itemId) || same(i.title, name));
  const listTier = (t: Tier) => (t === "qol" ? "qol" : "standard");

  async function addProduct(p: Product, tier: Tier) {
    if (cart.some((r) => r.catalog_product_id === p.id)) return;
    const house = p.canonical_concept ? stock.find((s) => s.canonical_concept === p.canonical_concept) : undefined;
    const shop = shops.find((s) => s.name === (p.store === "naivas" ? "Naivas" : "Quickmart"));
    const id = crypto.randomUUID();
    await change("insert", { id, title: p.title, qty: null, quantity: 1, shop_id: shop?.id ?? null, item_id: house?.id ?? null, bought_at: null, shopping_tier: listTier(tier), catalog_product_id: p.id, preferred_store: p.store });
    setUndo({ id: Date.now(), message: `${p.title} added`, undo: () => change("delete", { id }) });
  }

  async function addHouseItem(s: StockItem, deal?: CatalogMatch) {
    if (onList(s.name, s.id)) return;
    const id = crypto.randomUUID();
    await change("insert", { id, title: s.name, qty: null, quantity: 1, shop_id: s.shop_id, item_id: s.id, bought_at: null, shopping_tier: listTier(s.shopping_tier ?? "standard"), catalog_product_id: deal?.id ?? null, preferred_store: deal?.store ?? null });
    setUndo({ id: Date.now(), message: `${s.name} added`, undo: () => change("delete", { id }) });
  }

  // Anything, for any place: whoever goes buys it.
  async function addAnything(title: string, shopId: string | null, itemId: string | null) {
    if (onList(title, itemId ?? undefined)) return;
    const id = crypto.randomUUID();
    await change("insert", { id, title, qty: null, quantity: 1, shop_id: shopId, item_id: itemId, bought_at: null, shopping_tier: "standard", urgent: false });
    setUndo({ id: Date.now(), message: `${title} added`, undo: () => change("delete", { id }) });
  }

  async function setQuantity(row: ShoppingItem, quantity: number) {
    if (quantity <= 0) {
      await change("delete", { id: row.id });
      const copy = { title: row.title, qty: row.qty, quantity: 1, shop_id: row.shop_id, item_id: row.item_id, bought_at: null, shopping_tier: row.shopping_tier, catalog_product_id: row.catalog_product_id, preferred_store: row.preferred_store };
      setUndo({ id: Date.now(), message: `${row.title} removed`, undo: () => change("insert", { ...copy, id: crypto.randomUUID() }) });
    } else await change("update", { id: row.id, quantity });
  }

  // Shop this again: the old basket goes back on the list, to change as usual.
  async function shopAgain(trip: Trip, lines: TripLine[]) {
    const ids: string[] = [];
    for (const l of lines) {
      const id = crypto.randomUUID();
      ids.push(id);
      const qty = Number(l.qty_bought ?? 1);
      const counted = !l.unit || l.unit === "piece";
      await syncEngine().queue("shopping_extras", "insert", {
        id,
        title: l.title,
        qty: counted ? null : `${qty} ${l.unit}`,
        quantity: counted ? Math.max(1, Math.round(qty)) : 1,
        shop_id: (l.item_id && stockById.get(l.item_id)?.shop_id) || trip.shop_id,
        item_id: l.item_id,
        bought_at: null,
        shopping_tier: "standard",
        urgent: false,
      });
    }
    void syncNow();
    setView("list");
    setUndo({
      id: Date.now(),
      message: `${ids.length === 1 ? "1 thing" : `${ids.length} things`} back on the list`,
      undo: async () => {
        for (const id of ids) await syncEngine().queue("shopping_extras", "delete", { id });
        void syncNow();
      },
    });
  }

  const switcher = (
    <div role="tablist" aria-label="Shop" className="grid grid-cols-3 gap-1 rounded-full border border-line bg-raised p-1">
      {VIEWS.map((v) => (
        <button key={v.id} type="button" role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)} className={`min-h-11 rounded-full px-1 text-sm font-bold leading-tight ${view === v.id ? "bg-ink text-raised" : "text-ink"}`}>
          {v.label}
        </button>
      ))}
    </div>
  );

  const supermarketLines = cartLines.filter((l, i) => placeOf(shops.find((s) => s.id === cart[i].shop_id)) === "supermarket");

  return (
    <Screen title={view === "catalog" ? "Catalog" : view === "past" ? "Past shops" : "Shop"}>
      {switcher}
      {view === "list" && <ShopList stock={stock} shops={shops} members={members} items={items} auto={auto} matches={matches} trips={trips} foodLeft={foodLeft} />}
      {view === "catalog" && (
        <div role="radiogroup" aria-label="Where" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
          {PLACES.filter((p) => p.id !== "anywhere" && shops.some((s) => placeOf(s) === p.id)).map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={place === p.id} onClick={() => setPlace(p.id)} className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold ${place === p.id ? "border-ink bg-ink text-raised" : "border-line bg-raised"}`}>
              {p.label}
            </button>
          ))}
        </div>
      )}
      {view === "catalog" && place !== "supermarket" && <PlaceCatalog place={place} stock={stock} shops={shops} trips={trips} lines={tripLines} cart={cart} onAddHouse={(s) => addHouseItem(s)} onAdd={addAnything} />}
      {view === "catalog" && place === "supermarket" && (
        <>
          <DealRestock stock={stock as StockLike[]} matches={matches} onList={onList} onAdd={(s, deal) => addHouseItem(s as StockItem, deal)} />
          {supermarketLines.length > 0 && <StoreCompare lines={supermarketLines} matches={matches} />}
          <CatalogView
            products={products}
            stock={stock}
            cart={cart}
            cartLines={cartLines}
            history={(history ?? []).filter((h) => h.qty !== "skip")}
            onAdd={addProduct}
            onAddHouse={(s) => addHouseItem(s)}
            onQty={setQuantity}
            onTier={(row, tier) => change("update", { id: row.id, shopping_tier: listTier(tier) })}
            onViewCart={() => setView("list")}
          />
        </>
      )}
      {view === "past" && <AddEarlier trips={trips} lines={tripLines} shops={shops} stock={stock} meId={me?.id} />}
      {view === "past" && <PastShops trips={trips} lines={tripLines} shops={shops} members={members} onList={cart} onAgain={shopAgain} />}
      <UndoBar state={undo} onClose={closeUndo} />
    </Screen>
  );
}
