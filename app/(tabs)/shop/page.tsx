"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Empty, Screen } from "@/components/Screen";
import { useSync } from "@/components/SyncProvider";
import { UndoBar, type UndoState } from "@/components/UndoBar";
import { CatalogSearch } from "@/components/shop/CatalogSearch";
import { DealRestock } from "@/components/shop/DealRestock";
import { ItemPrice } from "@/components/shop/ItemPrice";
import { ModeBar } from "@/components/shop/ModeBar";
import { StoreCompare } from "@/components/shop/StoreCompare";
import { TripCheck, type Trip } from "@/components/shop/TripCheck";
import {
  estimate,
  inMode,
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
import { SHOP_HINT, SUPERMARKETS, sortShops, type Shop, type ShoppingItem, type StockItem } from "@/lib/shopping/shops";
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

export default function ShopPage() {
  const { syncNow } = useSync();
  const me = useMe();
  const shops = sortShops(useRows<Shop>("shops") ?? []);
  const stockRows = useRows<StockItem>("stock_items");
  const stock = useMemo(() => stockRows ?? [], [stockRows]);
  const items = useRows<ShoppingItem>("shopping_extras");
  const members = useRows<Member>("members") ?? [];
  const trips = useRows<Trip>("shopping_trips") ?? [];
  const money = useRows<MoneyEntry & { id: string }>("money_entries") ?? [];
  const matches = (useLiveQuery(() => localDB().catalog.toArray(), [], []) ?? []) as unknown as CatalogMatch[];

  const [mode, setModeState] = useState<Mode>({ base: "full", upgrades: false });
  useEffect(() => setModeState(savedMode()), []);
  const [title, setTitle] = useState("");
  const [qty, setQty] = useState("");
  const [shopId, setShopId] = useState("");
  const [tier, setTier] = useState<Tier>("standard");
  const [note, setNote] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoState>(null);
  const [showHouseList, setShowHouseList] = useState(false);
  const closeUndo = useCallback(() => setUndo(null), []);

  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, JSON.stringify(m));
    } catch {}
  };

  const stockById = useMemo(() => new Map(stock.map((s) => [s.id, s])), [stock]);
  const needed = useMemo(() => (items ?? []).filter((i) => !i.bought_at).sort(byNewest), [items]);
  const bought = useMemo(() => (items ?? []).filter((i) => i.bought_at).sort(byNewest), [items]);
  const toLine = (i: ShoppingItem): ListLine => ({
    id: i.id,
    title: i.title,
    shopping_tier: i.shopping_tier,
    catalog_product_id: i.catalog_product_id,
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
    if (opts.catalog) await localDB().catalog.put(opts.catalog as never); // keep its price offline
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

  async function clearBought() {
    const done = [...bought];
    for (const i of done) await syncEngine().queue("shopping_extras", "delete", { id: i.id });
    void syncNow();
    setUndo({ id: Date.now(), message: done.length === 1 ? "1 bought item cleared" : `${done.length} bought items cleared` });
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

  const row = (i: ShoppingItem, who: string) => (
    <ItemRow key={i.id} item={i} who={who} badge={i.bought_at ? null : badgeFor(i)} onToggle={() => toggle(i)} onRemove={() => remove(i)}>
      {!i.bought_at && <ItemPrice line={toLine(i)} matches={matches} />}
    </ItemRow>
  );

  return (
    <Screen title="Shopping list">
      <ModeBar mode={mode} onChange={setMode} totals={totals} estimate={current.total} unpriced={current.unpriced} moneyLeft={moneyLeft} />

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
          {hidden === 1 ? "1 more item" : `${hidden} more items`} on the list under {mode.base === "essential" ? "Full shop or Upgrades" : "Upgrades"}.
        </p>
      )}

      {bought.length > 0 && (
        <section className="rounded-xl border border-line p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold">In the basket ({bought.length})</h2>
            <button type="button" onClick={clearBought} className="min-h-12 rounded-xl px-3 font-bold text-brand">
              Done shopping
            </button>
          </div>
          <ul className="mt-1 divide-y divide-line">{bought.map((i) => row(i, ""))}</ul>
        </section>
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

      <CatalogSearch onAdd={(p) => addItem(p.title, { catalog: p, tier: "standard" })} />

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
  children,
}: {
  item: ShoppingItem;
  who: string;
  badge?: string | null;
  onToggle: () => void;
  onRemove: () => void;
  children?: React.ReactNode;
}) {
  const done = Boolean(item.bought_at);
  const tierTag = item.shopping_tier === "essential" ? "Essential" : item.shopping_tier === "qol" ? "Can wait" : null;
  return (
    <li className="flex items-start gap-1">
      <button type="button" aria-pressed={done} onClick={onToggle} aria-label={`${done ? "Untick" : "Tick"} ${item.title}`} className="flex min-h-14 shrink-0 items-center px-4 py-2">
        <span
          aria-hidden="true"
          className={`flex size-7 items-center justify-center rounded-full border-2 ${done ? "border-brand bg-brand text-brand-contrast" : "border-muted"}`}
        >
          {done && "✓"}
        </span>
      </button>
      <div className="min-w-0 flex-1 py-3">
        <button type="button" onClick={onToggle} className="block text-left">
          <span className={`font-bold ${done ? "text-muted line-through" : ""}`}>{item.title}</span>
          {badge && (
            <span className={`ml-2 rounded-md px-1.5 text-xs font-bold ${badge.endsWith("Out") ? "bg-out-bg text-out-fg" : "bg-low-bg text-low-fg"}`}>
              {badge.endsWith("Out") ? "✕ " : "! "}
              {badge}
            </span>
          )}
          {tierTag && !done && <span className="ml-2 rounded-md bg-base px-1.5 text-xs font-bold text-muted">{tierTag}</span>}
        </button>
        {(item.qty || who) && <span className="block text-sm text-muted">{[item.qty, who && `added by ${who}`].filter(Boolean).join(" · ")}</span>}
        {children}
      </div>
      <button type="button" onClick={onRemove} aria-label={`Remove ${item.title}`} className="flex size-12 shrink-0 items-center justify-center text-muted">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </li>
  );
}
