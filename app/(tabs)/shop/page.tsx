"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Empty, Screen } from "@/components/Screen";
import { useSync } from "@/components/SyncProvider";
import { UndoBar, type UndoState } from "@/components/UndoBar";
import { CatalogView } from "@/components/shop/CatalogView";
import { DealRestock } from "@/components/shop/DealRestock";
import { AisleBar, SwapBrand, useWakeLock } from "@/components/shop/Aisle";
import { PutAway } from "@/components/shop/PutAway";
import { ItemPrice } from "@/components/shop/ItemPrice";
import { ModeBar } from "@/components/shop/ModeBar";
import { StoreCompare } from "@/components/shop/StoreCompare";
import { TripCheck, isActive, type Trip } from "@/components/shop/TripCheck";
import {
  estimate,
  inMode,
  kes,
  isCounted,
  stockStatus,
  moneyLeftThisMonth,
  type CatalogMatch,
  type ListLine,
  type Mode,
  type MoneyEntry,
  type StockLike,
  type Tier,
} from "@/lib/shopping/pricing";
import { SHOP_HINT, SUPERMARKETS, type Shop, type ShoppingItem, type StockItem } from "@/lib/shopping/shops";
import type { Product } from "@/lib/shopping/catalog";
import { autoListItems, type PutAwayLine } from "@/lib/shopping/stock";
import { restockHouse } from "@/lib/sync/workflows";
import { fromTemplate, postJob, updateJob } from "@/lib/jobs/actions";
import type { Job } from "@/lib/jobs/logic";
import { TEMPLATES } from "@/lib/jobs/templates";
import { upgradeDeals } from "@/lib/shopping/predict";
import { useStock } from "@/lib/shopping/useStock";
import { localDB, syncEngine } from "@/lib/sync/client";
import { useMe, useRows, type Member } from "@/lib/sync/hooks";

const byNewest = (a: ShoppingItem, b: ShoppingItem) => (a.created_at ?? "").localeCompare(b.created_at ?? "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const TIERS: { value: Tier; label: string }[] = [
  { value: "essential", label: "Essential" },
  { value: "standard", label: "Full shop" },
  { value: "qol", label: "Can wait" },
];

const MODE_KEY = "kimemiah-shop-mode";
function savedMode(): Mode {
  try {
    const m = JSON.parse(localStorage.getItem(MODE_KEY) ?? "");
    if (m && (m.base === "essential" || m.base === "full")) return { base: m.base, upgrades: Boolean(m.upgrades) };
  } catch {}
  return { base: "full", upgrades: false };
}

const VIEW_KEY = "kimemiah-shop-view";
type View = "catalog" | "list";
const VIEWS: { id: View; label: string }[] = [
  { id: "catalog", label: "Catalog" },
  { id: "list", label: "Cart / List" },
];

// Shop tab: the supermarket Catalog and the family Cart / List, one switch apart. Stock has its own tab.
export default function ShopPage() {
  const { syncNow } = useSync();
  const [view, setViewState] = useState<View>("catalog");
  useEffect(() => {
    try {
      const v = new URLSearchParams(window.location.search).get("view") ?? localStorage.getItem(VIEW_KEY);
      if (v === "list") setViewState(v);
    } catch {}
  }, []);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  const { shops, stock, members } = useStock();
  const items = useRows<ShoppingItem>("shopping_extras");
  // Every list row ever (removed ones too), for "Most bought by the house".
  const history = useLiveQuery(() => localDB().rows("shopping_extras").toArray(), [], []) as ShoppingItem[];
  const products = (useLiveQuery(() => localDB().catalog.toArray(), [], []) ?? []) as unknown as Product[];
  const [undo, setUndo] = useState<UndoState>(null);
  const closeUndo = useCallback(() => setUndo(null), []);

  // Low / Out items join the list on their own until someone ticks them into the basket.
  const auto = useMemo<ShoppingItem[]>(
    () =>
      autoListItems(stock as (StockItem & StockLike)[], items ?? []).map((s) => ({
        id: `auto:${s.id}`,
        title: s.name,
        qty: null,
        shop_id: s.shop_id,
        item_id: s.id,
        bought_at: null,
        shopping_tier: s.shopping_tier,
        auto: true,
      })),
    [stock, items],
  );
  const cart = useMemo(() => [...auto, ...(items ?? []).filter((i) => !i.bought_at)], [auto, items]);
  const stockById = useMemo(() => new Map(stock.map((s) => [s.id, s])), [stock]);
  const cartLines = cart.map((i) => ({
    id: i.id,
    title: i.title,
    shopping_tier: i.shopping_tier,
    catalog_product_id: i.catalog_product_id,
    quantity: i.quantity,
    item: i.item_id ? (stockById.get(i.item_id) as StockLike | undefined) : undefined,
  }));

  const change = async (op: "insert" | "update" | "delete", row: Partial<ShoppingItem> & { id: string }) => {
    await syncEngine().queue("shopping_extras", op, row);
    void syncNow();
  };

  async function addProduct(p: Product, tier: Tier) {
    if (cart.some((r) => r.catalog_product_id === p.id)) return;
    const house = p.canonical_concept ? stock.find((s) => s.canonical_concept === p.canonical_concept) : undefined;
    const shop = shops.find((s) => s.name === (p.store === "naivas" ? "Naivas" : "Quickmart"));
    const id = crypto.randomUUID();
    await change("insert", {
      id,
      title: p.title,
      qty: null,
      quantity: 1,
      shop_id: shop?.id ?? null,
      item_id: house?.id ?? null,
      bought_at: null,
      shopping_tier: tier,
      catalog_product_id: p.id,
      preferred_store: p.store,
    });
    setUndo({ id: Date.now(), message: `${p.title} added`, undo: () => change("delete", { id }) });
  }

  async function addHouseItem(s: StockItem) {
    if (cart.some((r) => r.item_id === s.id)) return;
    const id = crypto.randomUUID();
    await change("insert", { id, title: s.name, qty: null, quantity: 1, shop_id: s.shop_id, item_id: s.id, bought_at: null, shopping_tier: s.shopping_tier ?? "standard" });
    setUndo({ id: Date.now(), message: `${s.name} added`, undo: () => change("delete", { id }) });
  }

  async function setQuantity(row: ShoppingItem, quantity: number) {
    if (quantity <= 0) {
      await change("delete", { id: row.id });
      const copy = {
        title: row.title,
        qty: row.qty,
        quantity: 1,
        shop_id: row.shop_id,
        item_id: row.item_id,
        bought_at: null,
        shopping_tier: row.shopping_tier,
        catalog_product_id: row.catalog_product_id,
        preferred_store: row.preferred_store,
      };
      setUndo({ id: Date.now(), message: `${row.title} removed`, undo: () => change("insert", { ...copy, id: crypto.randomUUID() }) });
    } else await change("update", { id: row.id, quantity });
  }

  const switcher = (
    <div role="tablist" aria-label="Shop" className="grid grid-cols-2 gap-1 rounded-full border border-line bg-raised p-1">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          role="tab"
          aria-selected={view === v.id}
          onClick={() => setView(v.id)}
          className={`min-h-12 rounded-full px-1 text-sm font-bold leading-tight ${view === v.id ? "bg-brand text-brand-contrast" : "text-ink"}`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );

  if (view === "catalog") {
    return (
      <Screen title="Catalog">
        {switcher}
        <CatalogView
          products={products}
          stock={stock}
          cart={cart}
          cartLines={cartLines}
          history={history ?? []}
          onAdd={addProduct}
          onAddHouse={addHouseItem}
          onQty={setQuantity}
          onTier={(row, tier) => change("update", { id: row.id, shopping_tier: tier })}
          onViewCart={() => setView("list")}
        />
        <UndoBar state={undo} onClose={closeUndo} />
      </Screen>
    );
  }
  return (
    <ShoppingList
      switcher={switcher}
      stock={stock}
      shops={shops}
      members={members}
      items={items}
      auto={auto}
      products={products}
      onBrowse={() => setView("catalog")}
    />
  );
}

type ListProps = {
  switcher: React.ReactNode;
  stock: StockItem[];
  shops: Shop[];
  members: Member[];
  items: ShoppingItem[] | undefined;
  auto: ShoppingItem[];
  products: Product[];
  onBrowse: () => void;
};

function ShoppingList({ switcher, stock, shops, members, items, auto, products, onBrowse }: ListProps) {
  const { syncNow } = useSync();
  const me = useMe();
  const trips = useRows<Trip>("shopping_trips") ?? [];
  const money = useRows<MoneyEntry & { id: string }>("money_entries") ?? [];
  // Price only what's on the list or tracked at home, not all ~7,000 products.
  const matches = useMemo(() => {
    const concepts = new Set(stock.map((s) => s.canonical_concept).filter(Boolean));
    const linked = new Set((items ?? []).map((i) => i.catalog_product_id).filter(Boolean));
    return products.filter((p) => p.in_stock !== false && (linked.has(p.id) || (p.canonical_concept && concepts.has(p.canonical_concept))));
  }, [products, stock, items]) as CatalogMatch[];

  const [mode, setModeState] = useState<Mode>({ base: "full", upgrades: false });
  useEffect(() => setModeState(savedMode()), []);
  const [title, setTitle] = useState("");
  const [qty, setQty] = useState("");
  const [shopId, setShopId] = useState("");
  const [tier, setTier] = useState<Tier>("standard");
  const [note, setNote] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoState>(null);
  const [showHouseList, setShowHouseList] = useState(false);
  const [puttingAway, setPuttingAway] = useState(false);
  const [aisle, setAisle] = useState(false);
  useWakeLock(aisle);
  const jobs = (useRows<Job & { id: string }>("jobs") ?? []) as Job[];
  const closeUndo = useCallback(() => setUndo(null), []);

  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, JSON.stringify(m));
    } catch {}
  };

  const stockById = useMemo(() => new Map(stock.map((s) => [s.id, s])), [stock]);
  const needed = useMemo(() => [...auto, ...(items ?? []).filter((i) => !i.bought_at).sort(byNewest)], [auto, items]);
  const bought = useMemo(() => (items ?? []).filter((i) => i.bought_at).sort(byNewest), [items]);
  const toLine = (i: ShoppingItem): ListLine => ({
    id: i.id,
    title: i.title,
    shopping_tier: i.shopping_tier,
    catalog_product_id: i.catalog_product_id,
    quantity: i.quantity,
    item: i.item_id ? (stockById.get(i.item_id) as StockLike | undefined) : undefined,
  });
  const allLines = needed.map(toLine);
  const visible = needed.filter((i) => inMode(i.shopping_tier, mode));
  const visibleLines = visible.map(toLine);
  const hidden = needed.length - visible.length;

  const totals = {
    essential: estimate(allLines.filter((l) => inMode(l.shopping_tier, { base: "essential", upgrades: false })), matches).total,
    full: estimate(allLines.filter((l) => inMode(l.shopping_tier, { base: "full", upgrades: false })), matches).total,
    upgrades: estimate(allLines.filter((l) => l.shopping_tier === "qol"), matches).total,
  };
  const current = estimate(visibleLines, matches);
  const moneyLeft = moneyLeftThisMonth(money);

  const onList = (name: string, itemId?: string) => needed.some((i) => (itemId && i.item_id === itemId) || same(i.title, name));
  const whoAdded = (i: ShoppingItem) => (i._local && !i.actor_id ? "you" : (members.find((m) => m.id === i.actor_id)?.name ?? ""));
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? "Someone";
  const shopByName = (n: string) => shops.find((s) => s.name === n);
  const supermarkets = shops.filter((s) => SUPERMARKETS.has(s.name));

  const change = async (op: "insert" | "update" | "delete", row: Partial<ShoppingItem> & { id: string }) => {
    await syncEngine().queue("shopping_extras", op, row);
    void syncNow();
  };

  async function addItem(name: string, opts: { qty?: string; shop?: string; itemId?: string; tier?: Tier; catalog?: CatalogMatch; quiet?: boolean } = {}) {
    const clean = name.trim();
    if (!clean) return;
    const match = opts.itemId ? stock.find((s) => s.id === opts.itemId) : stock.find((s) => same(s.name, clean));
    if (onList(clean, match?.id)) {
      if (!opts.quiet) setNote(`${match?.name ?? clean} is already on the list.`);
      return;
    }
    const catalogShop = opts.catalog ? shopByName(opts.catalog.store === "naivas" ? "Naivas" : "Quickmart")?.id : undefined;
    const id = crypto.randomUUID();
    await change("insert", {
      id,
      title: match?.name ?? clean,
      qty: opts.qty?.trim() || null,
      shop_id: opts.shop || catalogShop || match?.shop_id || shopByName("Other")?.id || null,
      item_id: match?.id ?? null,
      bought_at: null,
      shopping_tier: opts.tier ?? match?.shopping_tier ?? "standard",
      catalog_product_id: opts.catalog?.id ?? null,
      preferred_store: opts.catalog?.store ?? null,
    });
    setNote(null);
    if (!opts.quiet) setUndo({ id: Date.now(), message: `${match?.name ?? clean} added`, undo: () => change("delete", { id }) });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    await addItem(title, { qty, shop: shopId, tier });
    setTitle("");
    setQty("");
    setShopId("");
    setTier("standard");
  }

  function onTitleChange(value: string) {
    setTitle(value);
    const match = stock.find((s) => same(s.name, value));
    if (match?.shop_id) setShopId(match.shop_id);
    if (match?.shopping_tier) setTier(match.shopping_tier);
  }

  async function toggle(i: ShoppingItem) {
    if (i.auto) {
      // An automatic line becomes a real one once it's in the basket.
      const id = crypto.randomUUID();
      await change("insert", { id, title: i.title, qty: null, shop_id: i.shop_id, item_id: i.item_id, bought_at: new Date().toISOString(), shopping_tier: i.shopping_tier });
      setUndo({ id: Date.now(), message: `${i.title} in the basket`, undo: () => change("delete", { id }) });
      return;
    }
    const bought_at = i.bought_at ? null : new Date().toISOString();
    await change("update", { id: i.id, bought_at });
    if (bought_at) setUndo({ id: Date.now(), message: `${i.title} in the basket`, undo: () => change("update", { id: i.id, bought_at: null }) });
  }

  async function remove(i: ShoppingItem) {
    await change("delete", { id: i.id });
    setUndo({
      id: Date.now(),
      message: `${i.title} removed`,
      undo: () =>
        change("insert", {
          id: crypto.randomUUID(),
          title: i.title,
          qty: i.qty,
          shop_id: i.shop_id,
          item_id: i.item_id,
          bought_at: null,
          shopping_tier: i.shopping_tier,
          catalog_product_id: i.catalog_product_id,
          preferred_store: i.preferred_store,
        }),
    });
  }

  async function fixPrice(itemId: string, price: number) {
    await syncEngine().queue("stock_items", "update", { id: itemId, usual_price_kes: price });
  }

  // Shopping done: bought amounts into stock, the spend logged, the basket cleared, the run
  // job marked done (lib/sync/workflows.ts). Catalog items ticked "keep track" join Stock first.
  async function putAway(lines: PutAwayLine[], logSpend: boolean, track: string[]) {
    const trip = trips.find((t) => isActive(t) && t.member_id === me?.id);
    for (const l of lines.filter((x) => track.includes(x.extraId))) {
      const row = (items ?? []).find((i) => i.id === l.extraId);
      const product = products.find((p) => p.id === row?.catalog_product_id);
      const id = crypto.randomUUID();
      await syncEngine().queue("stock_items", "insert", {
        id,
        name: l.title,
        category: "other",
        unit: "piece",
        min_qty: 1,
        usual_price_kes: l.price ? Math.round(l.price) : null,
        shop_id: l.shopId,
        track_mode: "count",
        level: "ok",
        sort: 900,
        shopping_tier: row?.shopping_tier ?? "standard",
        canonical_concept: product?.canonical_concept ?? null,
        canonical_group_key: product?.canonical_group_key ?? null,
      });
      l.itemId = id;
      l.perPack = 1;
    }
    const { spent, runsDone } = await restockHouse(lines, {
      meId: me?.id,
      logSpend,
      tripId: trip?.id ?? null,
      extraIds: lines.map((l) => l.extraId).filter((id) => !id.startsWith("auto:")),
    });
    void syncNow();
    setPuttingAway(false);
    setUndo({
      id: Date.now(),
      message: `${lines.length === 1 ? "1 item" : `${lines.length} items`} added to stock${spent ? ` · ${kes(spent)} logged` : ""}${runsDone ? " · shopping run done" : ""}`,
    });
  }

  async function startTrip(shop: Shop, keep: StockLike[]) {
    for (const s of keep) await addItem(s.name, { itemId: s.id, tier: "essential", quiet: true });
    await syncEngine().queue("shopping_trips", "insert", {
      id: crypto.randomUUID(),
      shop_id: shop.id,
      member_id: me?.id ?? null,
      started_at: new Date().toISOString(),
      finished_at: null,
    });
    void syncNow();
    setUndo({ id: Date.now(), message: keep.length ? `Going to ${shop.name} · ${keep.length} added` : `Going to ${shop.name}` });
  }

  async function finishTrip(trip: Trip) {
    await syncEngine().queue("shopping_trips", "update", { id: trip.id, finished_at: new Date().toISOString() });
    void syncNow();
  }

  const groups = shops.map((shop) => ({ shop, rows: visible.filter((i) => i.shop_id === shop.id) })).filter((g) => g.rows.length > 0);
  const noShop = visible.filter((i) => !shops.some((s) => s.id === i.shop_id));
  const firstSupermarket = groups.find((g) => SUPERMARKETS.has(g.shop.name))?.shop.id;
  const supermarketLines = visible.filter((i) => SUPERMARKETS.has(shops.find((s) => s.id === i.shop_id)?.name ?? "")).map(toLine);

  const badgeFor = (i: ShoppingItem): string | null => {
    const s = i.item_id ? stockById.get(i.item_id) : undefined;
    if (!s || !isCounted(s as StockLike)) return null;
    const status = stockStatus(s as StockLike);
    if (status === "ok") return null;
    const word = status === "out" ? "Out" : "Low";
    return s.is_fast_mover ? `Fast-mover · ${word}` : word;
  };

  // Can-wait upgrades with a 12%+ deal this week.
  const deals = new Map(
    upgradeDeals(
      visible.map((i) => ({ ...i, concept: i.item_id ? stockById.get(i.item_id)?.canonical_concept : null })),
      matches,
    ).map((d) => [d.line.id, d.deal]),
  );
  const myTrip = trips.find((t) => isActive(t) && t.member_id === me?.id);
  const tripStore = shops.find((s) => s.id === myTrip?.shop_id)?.name === "Naivas" ? "naivas" : "quickmart";

  async function swap(i: ShoppingItem, product: CatalogMatch) {
    await change("update", { id: i.id, catalog_product_id: product.id, preferred_store: product.store });
    setUndo({ id: Date.now(), message: `Swapped to ${product.brand ?? product.title}` });
  }

  const row = (i: ShoppingItem, who: string) => (
    <ItemRow key={i.id} item={i} who={who} big={aisle} badge={i.bought_at ? null : badgeFor(i)} onToggle={() => toggle(i)} onRemove={i.auto ? undefined : () => remove(i)}>
      {!i.bought_at && deals.get(i.id) && (
        <span className="mt-1 inline-block rounded-md bg-ok-bg px-1.5 text-xs font-bold text-ok-fg">
          ✨ On sale this week: −{Math.round(deals.get(i.id)!.discount_pct)}% ({kes(deals.get(i.id)!.effective_price)})
        </span>
      )}
      {!i.bought_at && <ItemPrice line={toLine(i)} matches={matches} />}
      {!i.bought_at && !i.auto && aisle && <SwapBrand line={toLine(i)} matches={matches} store={tripStore} onSwap={(p) => swap(i, p)} />}
    </ItemRow>
  );

  // The supermarket run on the Jobs board, with its cost following the cart.
  const run = jobs.find((j) => !j.done_at && !j.deleted_at && j.template_key === "funded");
  const fullTotal = totals.full;
  useEffect(() => {
    if (run && fullTotal > 0 && Math.abs(Number(run.estimated_cost_kes ?? 0) - fullTotal) >= 50) {
      void updateJob(run.id, { estimated_cost_kes: Math.round(fullTotal) });
    }
  }, [run, fullTotal]);

  async function planRun() {
    const t = TEMPLATES.find((x) => x.id === "funded")!;
    await postJob({ ...fromTemplate(t), estimated_cost_kes: Math.round(fullTotal) || null });
    void syncNow();
    setUndo({ id: Date.now(), message: "Supermarket run posted on Jobs (2 people, in 3 days)" });
  }

  return (
    <Screen title="Cart / List">
      {switcher}
      <ModeBar mode={mode} onChange={setMode} totals={totals} estimate={current.total} unpriced={current.unpriced} moneyLeft={moneyLeft} />
      {needed.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {!aisle && (
            <button type="button" onClick={() => setAisle(true)} className="min-h-12 rounded-xl bg-brand px-4 font-bold text-brand-contrast">
              🛒 Start shopping in store
            </button>
          )}
          {run ? (
            <a href="/jobs" className="flex min-h-12 items-center rounded-xl border border-line px-4 text-sm font-bold">
              📅 Run planned{run.planned_for ? ` for ${run.planned_for}` : ""}
              {run.estimated_cost_kes ? ` · about ${kes(run.estimated_cost_kes)}` : ""}
            </a>
          ) : (
            <button type="button" onClick={planRun} className="min-h-12 rounded-xl border border-brand px-4 font-bold text-brand">
              📅 Plan a supermarket run
            </button>
          )}
        </div>
      )}

      <TripCheck
        supermarkets={supermarkets}
        trips={trips}
        stock={stock as StockLike[]}
        onList={onList}
        meId={me?.id}
        nameOf={nameOf}
        onStart={startTrip}
        onAdd={(s) => addItem(s.name, { itemId: s.id, tier: "essential" })}
        onFinish={finishTrip}
      />

      <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl bg-raised p-4 shadow-[0_1px_3px_rgba(10,51,35,.10)]">
        <label htmlFor="item" className="font-bold">
          Add an item
        </label>
        <input
          id="item"
          list="house-items"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="e.g. Cooking oil"
          autoComplete="off"
          className="min-h-12 rounded-xl border border-line bg-base px-3"
        />
        <datalist id="house-items">
          {stock.map((s) => (
            <option key={s.id} value={s.name} />
          ))}
        </datalist>
        <div className="flex gap-2">
          <input
            id="qty"
            aria-label="How much"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="How much (optional)"
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-base px-3"
          />
          <select
            id="shop"
            aria-label="Where to buy"
            value={shopId}
            onChange={(e) => setShopId(e.target.value)}
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-base px-2"
          >
            <option value="">Usual shop</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div role="radiogroup" aria-label="How urgent" className="grid grid-cols-3 gap-2">
          {TIERS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={tier === t.value}
              onClick={() => setTier(t.value)}
              className={`min-h-12 rounded-xl border text-sm font-bold ${tier === t.value ? "border-brand bg-brand text-brand-contrast" : "border-line"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {note && <p className="text-sm text-low-fg">{note}</p>}
        <button type="submit" disabled={!title.trim()} className="min-h-12 rounded-xl bg-brand font-bold text-brand-contrast disabled:opacity-50">
          Add to list
        </button>
      </form>

      {items && visible.length === 0 && (
        <Empty>{hidden > 0 ? `Nothing for this mode. ${hidden} more on the list under other modes.` : "Nothing needed right now."}</Empty>
      )}

      {groups.map(({ shop, rows }) => (
        <div key={shop.id} className="flex flex-col gap-4">
          {shop.id === firstSupermarket && <StoreCompare lines={supermarketLines} matches={matches} />}
          <section aria-labelledby={`shop-${shop.id}`} className="overflow-hidden rounded-xl bg-raised shadow-[0_1px_3px_rgba(10,51,35,.10)]">
            <header className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
              <h2 id={`shop-${shop.id}`} className="font-display text-xl">
                {shop.name}
              </h2>
              <span className="text-sm text-muted">{rows.length === 1 ? "1 item" : `${rows.length} items`}</span>
            </header>
            <ul className="divide-y divide-line">{rows.map((i) => row(i, whoAdded(i)))}</ul>
          </section>
        </div>
      ))}

      {noShop.length > 0 && (
        <section className="overflow-hidden rounded-xl bg-raised">
          <h2 className="border-b border-line px-4 py-3 font-display text-xl">Anywhere</h2>
          <ul className="divide-y divide-line">{noShop.map((i) => row(i, whoAdded(i)))}</ul>
        </section>
      )}

      {hidden > 0 && visible.length > 0 && (
        <p className="text-center text-sm text-muted">
          {hidden === 1 ? "1 more item" : `${hidden} more items`} saved for the next bulk run (under {mode.base === "essential" ? "Full shop or Upgrades" : "Upgrades"}).
        </p>
      )}

      {puttingAway ? (
        <PutAway
          bought={bought.length ? bought : visible}
          stockById={stockById}
          shops={shops}
          matches={matches}
          toLine={toLine}
          onFixPrice={fixPrice}
          onDone={putAway}
          onCancel={() => setPuttingAway(false)}
        />
      ) : bought.length > 0 ? (
        <section className="rounded-xl border border-line p-4">
          <h2 className="font-bold">In the basket ({bought.length})</h2>
          <ul className="mt-1 divide-y divide-line">{bought.map((i) => row(i, ""))}</ul>
          <button type="button" onClick={() => setPuttingAway(true)} className="mt-2 min-h-14 w-full rounded-xl bg-brand px-4 font-bold text-brand-contrast tabular">
            ✅ Shopping done · add all to stock ({kes(estimate(bought.map(toLine), matches).total)})
          </button>
        </section>
      ) : (
        visible.length > 0 && (
          <button type="button" onClick={() => setPuttingAway(true)} className="min-h-12 rounded-xl border border-brand px-4 font-bold text-brand">
            ✅ Shopping done · add what you bought to stock
          </button>
        )
      )}

      <DealRestock stock={stock as StockLike[]} matches={matches} onList={onList} onAdd={(s, deal) => addItem(s.name, { itemId: s.id, catalog: deal })} />

      <section className="rounded-xl bg-raised p-4 shadow-[0_1px_3px_rgba(10,51,35,.10)]">
        <button type="button" aria-expanded={showHouseList} onClick={() => setShowHouseList((v) => !v)} className="flex min-h-12 w-full items-center justify-between font-bold">
          Add from the house list
          <span aria-hidden="true" className="text-muted">
            {showHouseList ? "−" : "+"}
          </span>
        </button>
        {showHouseList && (
          <div className="mt-2 flex flex-col gap-4">
            {shops
              .map((shop) => ({ shop, list: stock.filter((s) => s.shop_id === shop.id).sort((a, b) => a.sort - b.sort) }))
              .filter((g) => g.list.length > 0)
              .map(({ shop, list }) => (
                <div key={shop.id}>
                  <h3 className="font-bold">{shop.name}</h3>
                  {SHOP_HINT[shop.name] && <p className="text-sm text-muted">{SHOP_HINT[shop.name]}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {list.map((s) => {
                      const added = onList(s.name, s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={added}
                          onClick={() => addItem(s.name, { itemId: s.id })}
                          className="min-h-12 rounded-full border border-line px-4 text-left disabled:border-transparent disabled:bg-ok-bg disabled:text-ok-fg"
                        >
                          {added ? `✓ ${s.name}` : s.name}
                          {s.shopping_tier === "qol" && !added && <span className="text-sm text-muted"> · can wait</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      <button type="button" onClick={onBrowse} className="min-h-12 rounded-xl border border-brand font-bold text-brand">
        Find more in the catalog
      </button>

      {aisle && (
        <AisleBar
          inTrolley={estimate(bought.map(toLine), matches).total}
          ticked={bought.length}
          total={bought.length + visible.length}
          remaining={current.total}
          moneyLeft={moneyLeft}
          onDone={() => setAisle(false)}
        />
      )}
      {aisle && <div className="h-20" aria-hidden="true" />}
      <UndoBar state={undo} onClose={closeUndo} />
    </Screen>
  );
}

function ItemRow({
  item,
  who,
  badge,
  onToggle,
  onRemove,
  big = false,
  children,
}: {
  item: ShoppingItem;
  big?: boolean; // aisle mode: bigger targets for one hand on a trolley
  who: string;
  badge?: string | null;
  onToggle: () => void;
  onRemove?: () => void;
  children?: React.ReactNode;
}) {
  const done = Boolean(item.bought_at);
  const many = Number(item.quantity) > 1 ? `×${item.quantity}` : null;
  const tierTag = item.shopping_tier === "essential" ? "Essential" : item.shopping_tier === "qol" ? "Can wait" : null;
  return (
    <li className="flex items-start gap-1">
      <button type="button" aria-pressed={done} onClick={onToggle} aria-label={`${done ? "Untick" : "Tick"} ${item.title}`} className={`flex shrink-0 items-center px-4 py-2 ${big ? "min-h-20" : "min-h-14"}`}>
        <span
          aria-hidden="true"
          className={`flex items-center justify-center rounded-full border-2 ${big ? "size-11 text-xl" : "size-7"} ${done ? "border-brand bg-brand text-brand-contrast" : "border-muted"}`}
        >
          {done && "✓"}
        </span>
      </button>
      <div className="min-w-0 flex-1 py-3">
        <button type="button" onClick={onToggle} className="block text-left">
          <span className={`font-bold ${big ? "text-lg" : ""} ${done ? "text-muted line-through" : ""}`}>{item.title}</span>
          {badge && (
            <span className={`ml-2 rounded-md px-1.5 text-xs font-bold ${badge.endsWith("Out") ? "bg-out-bg text-out-fg" : "bg-low-bg text-low-fg"}`}>
              {badge.endsWith("Out") ? "✕ " : "! "}
              {badge}
            </span>
          )}
          {tierTag && !done && <span className="ml-2 rounded-md bg-base px-1.5 text-xs font-bold text-muted">{tierTag}</span>}
        </button>
        {(many || item.qty || who) && <span className="block text-sm text-muted">{[many, item.qty, who && `added by ${who}`].filter(Boolean).join(" · ")}</span>}
        {children}
      </div>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${item.title}`} className="flex size-12 shrink-0 items-center justify-center text-muted">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </li>
  );
}
