"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { useSync } from "@/components/SyncProvider";
import { UndoBar, type UndoState } from "@/components/UndoBar";
import { ItemIcon } from "@/components/shop/ItemIcon";
import { ItemPrice } from "@/components/shop/ItemPrice";
import { fromTemplate, postJob } from "@/lib/jobs/actions";
import { TEMPLATES } from "@/lib/jobs/templates";
import { iconFor, isActive, PLACES, placeOf, type Trip } from "@/lib/shopping/market";
import { SKIP } from "@/lib/shopping/stock";
import { estimate, isCounted, kes, stockStatus, type CatalogMatch, type ListLine, type StockLike } from "@/lib/shopping/pricing";
import { sortShops, type Shop, type ShoppingItem, type StockItem } from "@/lib/shopping/shops";
import { sendAlertsNow } from "@/lib/push/client";
import { syncEngine } from "@/lib/sync/client";
import { useMe, type Member } from "@/lib/sync/hooks";

type Item = ShoppingItem & { urgent?: boolean };
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Where you can go shopping, as big tiles. */
const GO: string[] = ["Market", "Mama mboga", "Naivas", "Quickmart", "Kiosk", "Vet", "Kenchic", "Gas dealer", "Wholesaler", "Other"];

// The List: everything the house needs, grouped by where it's bought. Items marked ⚡ needed soon
// come first; low stock joins by itself. The wishlist waits at the bottom. One button starts a
// shop: pick where, and the basket opens.
export function ShopList({
  stock,
  shops,
  members,
  items,
  auto,
  matches,
  trips,
  foodLeft,
}: {
  stock: StockItem[];
  shops: Shop[];
  members: Member[];
  items: Item[];
  auto: Item[];
  matches: CatalogMatch[];
  trips: Trip[];
  foodLeft: number | null;
}) {
  const router = useRouter();
  const { syncNow } = useSync();
  const me = useMe();
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [going, setGoing] = useState(false);
  const [more, setMore] = useState(false);
  const [undo, setUndo] = useState<UndoState>(null);
  const [note, setNote] = useState<string | null>(null);

  const stockById = new Map(stock.map((s) => [s.id, s]));
  const shopOf = (i: Item) => shops.find((s) => s.id === i.shop_id);
  const needed = [...auto, ...items.filter((i) => !i.bought_at)];
  const list = needed.filter((i) => i.shopping_tier !== "qol");
  const wish = needed.filter((i) => i.shopping_tier === "qol");
  const toLine = (i: Item): ListLine => ({ id: i.id, title: i.title, shopping_tier: i.shopping_tier, catalog_product_id: i.catalog_product_id, quantity: i.quantity, item: i.item_id ? (stockById.get(i.item_id) as StockLike | undefined) : undefined });
  const mine = trips.find((t) => isActive(t) && t.member_id === me?.id);
  const others = trips.filter((t) => isActive(t) && t.member_id !== me?.id);
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name.split(" ")[0] ?? "Someone";

  const change = async (op: "insert" | "update" | "delete", row: Partial<Item> & { id: string }) => {
    await syncEngine().queue("shopping_extras", op, row);
    void syncNow();
  };

  async function add(e: FormEvent) {
    e.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    const house = stock.find((s) => same(s.name, clean));
    if (needed.some((i) => (house && i.item_id === house.id) || same(i.title, clean))) {
      setNote(`${house?.name ?? clean} is already on the list.`);
      return;
    }
    const id = crypto.randomUUID();
    await change("insert", { id, title: house?.name ?? clean, qty: null, quantity: 1, shop_id: house?.shop_id ?? null, item_id: house?.id ?? null, bought_at: null, shopping_tier: "standard", urgent: false });
    setTitle("");
    setNote(null);
    setUndo({ id: Date.now(), message: `${house?.name ?? clean} added`, undo: () => change("delete", { id }) });
  }

  async function remove(i: Item) {
    await change("delete", { id: i.id });
    setEditing(null);
    setUndo({
      id: Date.now(),
      message: `${i.title} removed`,
      undo: () => change("insert", { id: crypto.randomUUID(), title: i.title, qty: i.qty, quantity: i.quantity, shop_id: i.shop_id, item_id: i.item_id, bought_at: null, shopping_tier: i.shopping_tier, catalog_product_id: i.catalog_product_id, preferred_store: i.preferred_store, urgent: i.urgent ?? false }),
    });
  }

  async function startShop(shop: Shop) {
    const id = crypto.randomUUID();
    await syncEngine().queue("shopping_trips", "insert", { id, shop_id: shop.id, member_id: me?.id ?? null, started_at: new Date().toISOString(), finished_at: null });
    // Everyone at home gets "Greg is at the market" so they can add to the list in time.
    void syncNow().then((r) => {
      if (r?.ok) void sendAlertsNow();
    });
    router.push("/shop/basket");
  }

  // Clear: what people added goes; low-stock items are skipped for a week (they come back if still low).
  async function clearList() {
    const added = list.filter((i) => !i.auto);
    const low = list.filter((i) => i.auto);
    if (!list.length) return;
    const now = new Date().toISOString();
    for (const i of added) await syncEngine().queue("shopping_extras", "delete", { id: i.id });
    const skips = low.map((i) => ({ id: crypto.randomUUID(), title: i.title, qty: SKIP, quantity: 1, shop_id: i.shop_id, item_id: i.item_id, bought_at: now, shopping_tier: "standard" as const, urgent: false }));
    for (const s of skips) await syncEngine().queue("shopping_extras", "insert", s);
    void syncNow();
    setMore(false);
    setUndo({
      id: Date.now(),
      message: `List cleared (${list.length})`,
      undo: async () => {
        for (const s of skips) await syncEngine().queue("shopping_extras", "delete", { id: s.id });
        for (const i of added) await syncEngine().queue("shopping_extras", "insert", { id: crypto.randomUUID(), title: i.title, qty: i.qty, quantity: i.quantity, shop_id: i.shop_id, item_id: i.item_id, bought_at: null, shopping_tier: i.shopping_tier, catalog_product_id: i.catalog_product_id, preferred_store: i.preferred_store, urgent: i.urgent ?? false });
        void syncNow();
      },
    });
  }

  const whatsapp = ["Kimemiah shopping list", ...PLACES.flatMap((p) => {
    const rows = list.filter((i) => placeOf(shopOf(i)) === p.id);
    return rows.length ? ["", `${p.label}:`, ...rows.map((i) => `- ${i.title}${i.qty ? ` (${i.qty})` : (i.quantity ?? 1) > 1 ? ` x${i.quantity}` : ""}${i.urgent ? " ⚡" : ""}`)] : [];
  })].join("\n");
  const wishTotal = estimate(wish.map(toLine), matches).total;

  const badge = (i: Item) => {
    const s = i.item_id ? stockById.get(i.item_id) : undefined;
    if (!s || !isCounted(s as StockLike)) return null;
    const st = stockStatus(s as StockLike);
    return st === "ok" ? null : st === "out" ? "Out" : "Low";
  };

  const row = (i: Item) => {
    const b = badge(i);
    return (
      <li key={i.id}>
        <button type="button" onClick={() => setEditing(i)} className="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left hover:bg-base">
          <ItemIcon id={iconFor(i.title, i.item_id ? stockById.get(i.item_id)?.category : null)} />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{i.title}</span>
            <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
              {i.qty ? <span>{i.qty}</span> : (i.quantity ?? 1) > 1 ? <span>× {i.quantity}</span> : null}
              {i.urgent && <span className="rounded-md bg-low-bg px-1.5 font-bold text-low-fg">⚡ Needed soon</span>}
              {b && <span className={`rounded-md px-1.5 font-bold ${b === "Out" ? "bg-out-bg text-out-fg" : "bg-low-bg text-low-fg"}`}>{b}</span>}
              {i.auto && <span>from Stock</span>}
            </span>
          </span>
          {placeOf(shopOf(i)) === "supermarket" && estimate([toLine(i)], matches).total > 0 && <span className="shrink-0 text-sm text-muted tabular">~{kes(estimate([toLine(i)], matches).total)}</span>}
        </button>
      </li>
    );
  };

  return (
    <>
      {mine && (
        <Link href="/shop/basket" className="flex items-center justify-between gap-3 rounded-2xl bg-ink p-4 text-raised lg:[column-span:all]">
          <span>
            <span className="block text-xs uppercase tracking-wider opacity-80">You&apos;re shopping</span>
            <span className="text-lg font-bold">{shops.find((s) => s.id === mine.shop_id)?.name ?? "Out"} · open the basket</span>
          </span>
          <span aria-hidden="true" className="text-2xl">
            ›
          </span>
        </Link>
      )}
      {others.map((t) => (
        <p key={t.id} className="text-sm text-muted lg:[column-span:all]">
          🛍 {nameOf(t.member_id)} is at {shops.find((s) => s.id === t.shop_id)?.name ?? "the shops"} now. Add anything you need.
        </p>
      ))}

      <div className="flex gap-2 lg:[column-span:all]">
        {!mine && (
          <button type="button" onClick={() => setGoing(true)} className="min-h-14 flex-1 rounded-xl bg-brand px-5 text-lg font-bold text-brand-contrast">
            🛍 I&apos;m going shopping
          </button>
        )}
        <button type="button" aria-label="More" onClick={() => setMore(true)} className="min-h-14 rounded-xl border border-line bg-raised px-5 text-xl">
          ⋯
        </button>
      </div>

      <form onSubmit={add} className="flex gap-2 lg:[column-span:all]">
        <label htmlFor="add-item" className="sr-only">
          Add something to the list
        </label>
        <input id="add-item" list="house-items" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add to the list: tomatoes, Jik, dog meat…" className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-raised px-4" />
        <datalist id="house-items">
          {stock
            .filter((s) => s.track_mode !== "tool" && !s.deleted_at)
            .map((s) => (
              <option key={s.id} value={s.name} />
            ))}
        </datalist>
        <button type="submit" disabled={!title.trim()} className="min-h-12 shrink-0 rounded-xl border border-ink px-5 font-bold disabled:opacity-40">
          Add
        </button>
      </form>
      {note && <p className="text-sm text-muted lg:[column-span:all]">{note}</p>}
      {foodLeft != null && <p className="text-sm text-muted lg:[column-span:all]">Food budget left this month: <strong className="text-ink">{kes(foodLeft)}</strong></p>}

      {PLACES.map((p) => {
        const rows = list.filter((i) => placeOf(shopOf(i)) === p.id).sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent) || Number(!!badge(b)) - Number(!!badge(a)));
        if (!rows.length) return null;
        return (
          <section key={p.id} aria-labelledby={`place-${p.id}`} className="overflow-hidden rounded-2xl border border-line bg-raised">
            <header className="flex items-baseline justify-between gap-2 px-4 pb-1 pt-4">
              <h2 id={`place-${p.id}`} className="font-display text-lg">
                {p.label}
              </h2>
              <span className="text-xs text-muted">{rows.length === 1 ? "1 thing" : `${rows.length} things`}</span>
            </header>
            <ul className="divide-y divide-line">{rows.map(row)}</ul>
          </section>
        );
      })}
      {!list.length && <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-muted lg:[column-span:all]">Nothing on the list. Add something above, or shop again from Past shops.</p>}

      {wish.length > 0 && (
        <details className="rounded-2xl border border-line bg-raised">
          <summary className="flex min-h-14 cursor-pointer items-center justify-between px-4 font-display text-lg">
            Wishlist ({wish.length})<span className="text-xs text-muted">when there&apos;s money</span>
          </summary>
          <ul className="divide-y divide-line border-t border-line">{wish.map(row)}</ul>
          {wishTotal > 0 && (
            <div className="border-t border-line p-4">
              <button
                type="button"
                onClick={async () => {
                  await syncEngine().queue("projects", "insert", { id: crypto.randomUUID(), title: wish.length === 1 ? wish[0].title : `Wishlist: ${wish.slice(0, 3).map((i) => i.title).join(", ")}${wish.length > 3 ? "…" : ""}`, kind: "upgrade", target_kes: Math.round(wishTotal), notes: wish.map((i) => i.title).join(", "), job_id: null, status: "saving" });
                  void syncNow();
                  setUndo({ id: Date.now(), message: `Saving up on Money (${kes(wishTotal)})` });
                }}
                className="min-h-11 rounded-xl border border-line px-4 text-sm font-bold"
              >
                💰 Save up for these ({kes(wishTotal)})
              </button>
            </div>
          )}
        </details>
      )}

      {going && (
        <BottomSheet title="Where are you going?" onClose={() => setGoing(false)}>
          <div className="flex flex-col gap-3 pb-2">
            <h2 className="font-display text-2xl">Where are you going?</h2>
            <p className="text-sm text-muted">The house gets a message so they can add what they need.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {sortShops(shops)
                .filter((s) => GO.includes(s.name))
                .sort((a, b) => GO.indexOf(a.name) - GO.indexOf(b.name))
                .map((s) => {
                  const n = list.filter((i) => i.shop_id === s.id || (placeOf(shopOf(i)) === placeOf(s) && placeOf(s) !== "other") || !i.shop_id).length;
                  return (
                    <button key={s.id} type="button" onClick={() => void startShop(s)} className="flex min-h-20 flex-col items-start justify-center rounded-xl border border-line bg-raised px-4 text-left hover:border-ink">
                      <span className="font-bold">{s.name}</span>
                      <span className="text-xs text-muted">{n ? `${n} on the list` : "Nothing listed"}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        </BottomSheet>
      )}

      {more && (
        <BottomSheet title="More" onClose={() => setMore(false)}>
          <div className="flex flex-col gap-2 pb-2">
            <a href={`https://wa.me/?text=${encodeURIComponent(whatsapp)}`} target="_blank" rel="noreferrer" className="flex min-h-12 items-center rounded-xl border border-line px-4 font-bold">
              Send the list on WhatsApp
            </a>
            <button
              type="button"
              onClick={async () => {
                const t = TEMPLATES.find((x) => x.id === "funded")!;
                const total = estimate(list.filter((i) => placeOf(shopOf(i)) === "supermarket").map(toLine), matches).total;
                await postJob({ ...fromTemplate(t), estimated_cost_kes: Math.round(total) || null });
                void syncNow();
                setMore(false);
                setUndo({ id: Date.now(), message: "Supermarket run posted on Jobs" });
              }}
              className="flex min-h-12 items-center rounded-xl border border-line px-4 text-left font-bold"
            >
              Plan a supermarket run on Jobs
            </button>
            <button type="button" disabled={!list.length} onClick={() => void clearList()} className="flex min-h-12 flex-col items-start justify-center rounded-xl border border-line px-4 py-2 text-left font-bold disabled:opacity-40">
              Clear the list{list.length ? ` (${list.length})` : ""}
              {list.some((i) => i.auto) && <span className="text-xs font-normal text-muted">Low-stock things come back in a week if they&apos;re still low.</span>}
            </button>
          </div>
        </BottomSheet>
      )}

      {editing && (
        <EditSheet
          item={editing}
          shops={shops}
          price={placeOf(shopOf(editing)) === "supermarket" ? <ItemPrice line={toLine(editing)} matches={matches} /> : null}
          onClose={() => setEditing(null)}
          onSave={async (changes) => {
            if (editing.auto) {
              // A low-stock line becomes a real list line once someone changes it.
              await change("insert", { id: crypto.randomUUID(), title: editing.title, qty: null, quantity: 1, shop_id: editing.shop_id, item_id: editing.item_id, bought_at: null, shopping_tier: "standard", urgent: false, ...changes });
            } else await change("update", { id: editing.id, ...changes });
            setEditing(null);
          }}
          onRemove={editing.auto ? undefined : () => void remove(editing)}
        />
      )}
      <UndoBar state={undo} onClose={() => setUndo(null)} />
    </>
  );
}

function EditSheet({ item, shops, price, onClose, onSave, onRemove }: { item: Item; shops: Shop[]; price: React.ReactNode; onClose: () => void; onSave: (c: Partial<Item>) => void; onRemove?: () => void }) {
  const [qty, setQty] = useState(item.qty ?? "");
  const [shopId, setShopId] = useState(item.shop_id ?? "");
  const [urgent, setUrgent] = useState(!!item.urgent);
  const [wish, setWish] = useState(item.shopping_tier === "qol");
  const field = "min-h-12 w-full rounded-xl border border-line bg-raised px-3";
  return (
    <BottomSheet title={item.title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ qty: qty.trim() || null, shop_id: shopId || null, urgent, shopping_tier: wish ? "qol" : "standard" });
        }}
        className="flex flex-col gap-3 pb-2"
      >
        <div className="flex items-center gap-3">
          <ItemIcon id={iconFor(item.title)} size={48} />
          <h2 className="font-display text-2xl">{item.title}</h2>
        </div>
        {item.auto && <p className="text-sm text-muted">On the list because it&apos;s low in Stock.</p>}
        {price && <div className="rounded-xl bg-raised p-3 text-sm">{price}</div>}
        <label className="flex flex-col gap-1 text-sm font-bold">
          How much
          <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 2 kg, 3 bunches" className={`${field} font-normal`} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Where it&apos;s bought
          <select value={shopId} onChange={(e) => setShopId(e.target.value)} className={`${field} font-normal`}>
            <option value="">Anywhere</option>
            {sortShops(shops).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line px-4">
          <span>⚡ Needed soon</span>
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="size-5" />
        </label>
        <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line px-4">
          <span>
            <span className="block">Wishlist</span>
            <span className="text-xs text-muted">Nice to have, when there&apos;s money</span>
          </span>
          <input type="checkbox" checked={wish} onChange={(e) => setWish(e.target.checked)} className="size-5" />
        </label>
        <button type="submit" className="min-h-12 rounded-xl bg-brand font-bold text-brand-contrast">
          Save
        </button>
        {onRemove && (
          <button type="button" onClick={onRemove} className="min-h-11 text-sm font-bold text-muted underline underline-offset-4">
            Take it off the list
          </button>
        )}
      </form>
    </BottomSheet>
  );
}
