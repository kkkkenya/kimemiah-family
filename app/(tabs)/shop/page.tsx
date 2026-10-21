"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { Empty, Screen } from "@/components/Screen";
import { useSync } from "@/components/SyncProvider";
import { UndoBar, type UndoState } from "@/components/UndoBar";
import { SHOP_HINT, sortShops, type Shop, type ShoppingItem, type StockItem } from "@/lib/shopping/shops";
import { syncEngine } from "@/lib/sync/client";
import { useRows, type Member } from "@/lib/sync/hooks";

const byNewest = (a: ShoppingItem, b: ShoppingItem) => (a.created_at ?? "").localeCompare(b.created_at ?? "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export default function ShopPage() {
  const { syncNow } = useSync();
  const shops = sortShops(useRows<Shop>("shops") ?? []);
  const stock = useRows<StockItem>("stock_items") ?? [];
  const items = useRows<ShoppingItem>("shopping_extras");
  const members = useRows<Member>("members") ?? [];

  const [title, setTitle] = useState("");
  const [qty, setQty] = useState("");
  const [shopId, setShopId] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoState>(null);
  const [showHouseList, setShowHouseList] = useState(false);
  const closeUndo = useCallback(() => setUndo(null), []);

  const needed = useMemo(() => (items ?? []).filter((i) => !i.bought_at).sort(byNewest), [items]);
  const bought = useMemo(() => (items ?? []).filter((i) => i.bought_at).sort(byNewest), [items]);
  const onList = (name: string, itemId?: string) =>
    needed.some((i) => (itemId && i.item_id === itemId) || same(i.title, name));

  const whoAdded = (i: ShoppingItem) =>
    i._local && !i.actor_id ? "you" : (members.find((m) => m.id === i.actor_id)?.name ?? "");

  const change = async (op: "insert" | "update" | "delete", row: Partial<ShoppingItem> & { id: string }) => {
    await syncEngine().queue("shopping_extras", op, row);
    void syncNow();
  };

  async function addItem(name: string, opts: { qty?: string; shop?: string; itemId?: string } = {}) {
    const clean = name.trim();
    if (!clean) return;
    const match = opts.itemId ? stock.find((s) => s.id === opts.itemId) : stock.find((s) => same(s.name, clean));
    if (onList(clean, match?.id)) {
      setNote(`${match?.name ?? clean} is already on the list.`);
      return;
    }
    const id = crypto.randomUUID();
    await change("insert", {
      id,
      title: match?.name ?? clean,
      qty: opts.qty?.trim() || null,
      shop_id: opts.shop || match?.shop_id || shops.find((s) => s.name === "Other")?.id || null,
      item_id: match?.id ?? null,
      bought_at: null,
    });
    setNote(null);
    setUndo({ id: Date.now(), message: `${match?.name ?? clean} added`, undo: () => change("delete", { id }) });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    await addItem(title, { qty, shop: shopId });
    setTitle("");
    setQty("");
    setShopId("");
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
        change("insert", { id: crypto.randomUUID(), title: i.title, qty: i.qty, shop_id: i.shop_id, item_id: i.item_id, bought_at: null }),
    });
  }

  async function clearBought() {
    const done = [...bought];
    for (const i of done) await syncEngine().queue("shopping_extras", "delete", { id: i.id });
    void syncNow();
    setUndo({ id: Date.now(), message: done.length === 1 ? "1 bought item cleared" : `${done.length} bought items cleared` });
  }

  // Picking a known item fills in its usual shop.
  function onTitleChange(value: string) {
    setTitle(value);
    const match = stock.find((s) => same(s.name, value));
    if (match?.shop_id) setShopId(match.shop_id);
  }

  const groups = shops
    .map((shop) => ({ shop, rows: needed.filter((i) => i.shop_id === shop.id) }))
    .filter((g) => g.rows.length > 0);
  const noShop = needed.filter((i) => !shops.some((s) => s.id === i.shop_id));

  return (
    <Screen title="Shopping list">
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
        {note && <p className="text-sm text-low-fg">{note}</p>}
        <button
          type="submit"
          disabled={!title.trim()}
          className="min-h-12 rounded-xl bg-brand font-bold text-brand-contrast disabled:opacity-50"
        >
          Add to list
        </button>
      </form>

      {items && needed.length === 0 && <Empty>Nothing needed right now.</Empty>}

      {groups.map(({ shop, rows }) => (
        <section key={shop.id} aria-labelledby={`shop-${shop.id}`} className="overflow-hidden rounded-xl bg-raised shadow-[0_1px_3px_rgba(10,51,35,.10)]">
          <header className="flex items-baseline justify-between gap-2 border-b border-line px-4 py-3">
            <h2 id={`shop-${shop.id}`} className="font-display text-xl">
              {shop.name}
            </h2>
            <span className="text-sm text-muted">{rows.length === 1 ? "1 item" : `${rows.length} items`}</span>
          </header>
          <ul className="divide-y divide-line">
            {rows.map((i) => (
              <ItemRow key={i.id} item={i} who={whoAdded(i)} onToggle={() => toggle(i)} onRemove={() => remove(i)} />
            ))}
          </ul>
        </section>
      ))}

      {noShop.length > 0 && (
        <section className="overflow-hidden rounded-xl bg-raised">
          <h2 className="border-b border-line px-4 py-3 font-display text-xl">Anywhere</h2>
          <ul className="divide-y divide-line">
            {noShop.map((i) => (
              <ItemRow key={i.id} item={i} who={whoAdded(i)} onToggle={() => toggle(i)} onRemove={() => remove(i)} />
            ))}
          </ul>
        </section>
      )}

      {bought.length > 0 && (
        <section className="rounded-xl border border-line p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold">In the basket ({bought.length})</h2>
            <button type="button" onClick={clearBought} className="min-h-12 rounded-xl px-3 font-bold text-brand">
              Done shopping
            </button>
          </div>
          <ul className="mt-1 divide-y divide-line">
            {bought.map((i) => (
              <ItemRow key={i.id} item={i} who="" onToggle={() => toggle(i)} onRemove={() => remove(i)} />
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl bg-raised p-4 shadow-[0_1px_3px_rgba(10,51,35,.10)]">
        <button
          type="button"
          aria-expanded={showHouseList}
          onClick={() => setShowHouseList((v) => !v)}
          className="flex min-h-12 w-full items-center justify-between font-bold"
        >
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
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>

      <UndoBar state={undo} onClose={closeUndo} />
    </Screen>
  );
}

function ItemRow({ item, who, onToggle, onRemove }: { item: ShoppingItem; who: string; onToggle: () => void; onRemove: () => void }) {
  const done = Boolean(item.bought_at);
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        aria-pressed={done}
        onClick={onToggle}
        className="flex min-h-14 flex-1 items-center gap-3 px-4 py-2 text-left"
      >
        <span
          aria-hidden="true"
          className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 ${
            done ? "border-brand bg-brand text-brand-contrast" : "border-muted"
          }`}
        >
          {done && "✓"}
        </span>
        <span className="min-w-0">
          <span className={`block font-bold ${done ? "text-muted line-through" : ""}`}>{item.title}</span>
          {(item.qty || who) && (
            <span className="block text-sm text-muted">
              {[item.qty, who && `added by ${who}`].filter(Boolean).join(" · ")}
            </span>
          )}
        </span>
      </button>
      <button type="button" onClick={onRemove} aria-label={`Remove ${item.title}`} className="flex size-12 shrink-0 items-center justify-center text-muted">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </li>
  );
}
