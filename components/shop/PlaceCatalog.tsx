"use client";

import { useState, type FormEvent } from "react";
import { ItemIcon } from "@/components/shop/ItemIcon";
import { iconFor, placeOf, priceBook, priceFor, type PlaceId, type Trip, type TripLine } from "@/lib/shopping/market";
import { kes } from "@/lib/shopping/pricing";
import type { Shop, ShoppingItem, StockItem } from "@/lib/shopping/shops";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// The catalog for places without online prices (market, vet, kiosk, gas...): the house things
// bought there and anything bought there before, with the last price paid. Anyone can add to
// the list for someone else to buy, and type in anything that isn't there yet.
export function PlaceCatalog({
  place,
  stock,
  shops,
  trips,
  lines,
  cart,
  onAddHouse,
  onAdd,
}: {
  place: PlaceId;
  stock: StockItem[];
  shops: Shop[];
  trips: Trip[];
  lines: TripLine[];
  cart: ShoppingItem[];
  onAddHouse: (s: StockItem) => void;
  onAdd: (title: string, shopId: string | null, itemId: string | null) => void;
}) {
  const here = shops.filter((s) => placeOf(s) === place);
  const [shopId, setShopId] = useState(here[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const book = priceBook(lines.map((l) => ({ title: l.title ?? "", item_id: l.item_id, unit: l.unit, unit_price_kes: l.unit_price_kes, created_at: l.created_at, deleted_at: l.deleted_at })));
  const onList = (t: string, id?: string | null) => cart.some((r) => (id && r.item_id === id) || same(r.title, t));

  const house = stock.filter((s) => !s.deleted_at && s.track_mode !== "tool" && here.some((h) => h.id === s.shop_id)).sort((a, b) => a.name.localeCompare(b.name));
  // Things bought at this place before that aren't house items.
  const tripIds = new Set(trips.filter((t) => here.some((h) => h.id === t.shop_id)).map((t) => t.id));
  const before = [...new Map(lines.filter((l) => l.title && !l.item_id && !l.deleted_at && tripIds.has(l.trip_id)).map((l) => [l.title!.trim().toLowerCase(), l.title!])).values()];
  const match = (t: string) => !query.trim() || t.toLowerCase().includes(query.trim().toLowerCase());
  const tiles = [...house.map((s) => ({ key: s.id, title: s.name, item: s as StockItem | null })), ...before.map((t) => ({ key: t, title: t, item: null }))].filter((x) => match(x.title));

  function add(e: FormEvent) {
    e.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    const known = stock.find((s) => same(s.name, clean));
    onAdd(known?.name ?? clean, shopId || null, known?.id ?? null);
    setTitle("");
  }

  return (
    <section aria-label="Catalog for this place" className="flex flex-col gap-3 lg:[column-span:all]">
      {here.length > 1 && (
        <div role="radiogroup" aria-label="Which shop" className="flex flex-wrap gap-2">
          {here.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={shopId === s.id} onClick={() => setShopId(s.id)} className={`min-h-10 rounded-md border px-3 text-sm font-bold ${shopId === s.id ? "border-ink bg-ink text-raised" : "border-line bg-raised"}`}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={add} className="flex gap-2">
        <label htmlFor="place-add" className="sr-only">
          Add anything to the list
        </label>
        <input id="place-add" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add anything: avocados, dog meat, gas refill…" className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-raised px-4" />
        <button type="submit" disabled={!title.trim()} className="min-h-12 shrink-0 rounded-xl bg-brand px-5 font-bold text-brand-contrast disabled:opacity-40">
          Add
        </button>
      </form>
      {tiles.length > 6 && <input type="search" aria-label="Search this place" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="min-h-11 rounded-xl border border-line bg-raised px-4" />}
      {tiles.length ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {tiles.map((t) => {
            const added = onList(t.title, t.item?.id);
            const note = priceFor(book, { title: t.title, item_id: t.item?.id });
            const usual = t.item?.usual_price_kes;
            return (
              <li key={t.key}>
                <button
                  type="button"
                  disabled={added}
                  onClick={() => (t.item ? onAddHouse(t.item) : onAdd(t.title, shopId || null, null))}
                  className="flex h-full min-h-28 w-full flex-col items-start justify-between gap-2 rounded-2xl border border-line bg-raised p-3 text-left hover:border-ink disabled:border-transparent disabled:bg-ok-bg"
                >
                  <span className="flex w-full items-start justify-between">
                    <ItemIcon id={iconFor(t.title, t.item?.category)} size={40} />
                    <span className={`text-sm font-bold ${added ? "text-ok-fg" : ""}`}>{added ? "✓ On the list" : "+ Add"}</span>
                  </span>
                  <span className="w-full">
                    <span className="line-clamp-2 font-bold leading-snug">{t.title}</span>
                    <span className="block text-xs text-muted tabular">{note ? `Last ${kes(note.last)} / ${note.unit}` : usual ? `Usually ${kes(Number(usual))}` : "No price yet"}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-muted">Nothing here yet. Type anything above and it goes on the list for whoever goes.</p>
      )}
    </section>
  );
}
