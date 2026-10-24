"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { ItemIcon } from "@/components/shop/ItemIcon";
import { ReceiptReader } from "@/components/stock/ReceiptReader";
import { iconFor, isActive, shopAgain, unitLabel, type IconId, type Trip, type TripLine } from "@/lib/shopping/market";
import { kes } from "@/lib/shopping/pricing";
import { sortShops, type Shop, type ShoppingItem, type StockItem } from "@/lib/shopping/shops";
import { syncEngine } from "@/lib/sync/client";
import type { Member } from "@/lib/sync/hooks";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Nairobi" });

// Past shops: every finished shop, newest first, with what was bought and what it cost. "Shop
// this again" puts its things back on the list (skipping what's already there), where they can
// still be changed or removed like anything else.
export function PastShops({ trips, lines, shops, members, onList, onAgain }: { trips: Trip[]; lines: TripLine[]; shops: Shop[]; members: Member[]; onList: ShoppingItem[]; onAgain: (trip: Trip, lines: TripLine[]) => void }) {
  const [open, setOpen] = useState<Trip | null>(null);
  const done = trips.filter((t) => t.finished_at && !t.deleted_at).sort((a, b) => b.started_at.localeCompare(a.started_at));
  const linesOf = (t: Trip) => lines.filter((l) => l.trip_id === t.id && !l.deleted_at && l.title);
  const shopName = (t: Trip) => shops.find((s) => s.id === t.shop_id)?.name ?? "Shop";
  const who = (t: Trip) => members.find((m) => m.id === t.member_id)?.name.split(" ")[0] ?? "";
  const cost = (t: Trip) => Number(t.paid_kes ?? 0) || linesOf(t).reduce((s, l) => s + Number(l.total_kes ?? 0), 0);
  const shown = done.filter((t) => linesOf(t).length > 0 || t.paid_kes);

  if (!shown.length) {
    return <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-muted">No shops yet. When you pay for a basket, it shows up here so you can shop it again.</p>;
  }
  const again = open ? shopAgain(linesOf(open).map((l) => ({ ...l, title: l.title ?? "" })), onList) : [];

  return (
    <section aria-label="Past shops" className="overflow-hidden rounded-2xl border border-line bg-raised lg:[column-span:all]">
      <div className="hidden grid-cols-[8rem_1fr_6rem_6rem_7rem] gap-3 border-b border-line px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted lg:grid">
        <span>When</span>
        <span>Where and what</span>
        <span>Who</span>
        <span>Paid by</span>
        <span className="text-right">Total</span>
      </div>
      <ul className="divide-y divide-line">
        {shown.map((t) => {
          const ls = linesOf(t);
          return (
            <li key={t.id}>
              <button type="button" onClick={() => setOpen(t)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-base lg:grid lg:grid-cols-[8rem_1fr_6rem_6rem_7rem]">
                <span className="hidden text-sm lg:block">{day(t.started_at)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{shopName(t)}</span>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <span className="lg:hidden">{day(t.started_at)} · </span>
                    <span className="truncate">{ls.length ? ls.map((l) => l.title).join(", ") : "No items saved"}</span>
                  </span>
                </span>
                <span className="hidden text-sm lg:block">{who(t)}</span>
                <span className="hidden text-sm lg:block">{t.method === "mpesa" ? "M-Pesa" : t.method === "cash" ? "Cash" : "—"}</span>
                <span className="shrink-0 text-right font-bold tabular">{kes(cost(t))}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {open && (
        <BottomSheet title={shopName(open)} onClose={() => setOpen(null)}>
          <div className="flex flex-col gap-3 pb-2">
            <div>
              <h2 className="font-display text-2xl">{shopName(open)}</h2>
              <p className="text-sm text-muted">
                {day(open.started_at)}
                {who(open) && ` · ${who(open)}`}
                {open.method && ` · ${open.method === "mpesa" ? `M-Pesa${open.mpesa_code ? ` ${open.mpesa_code}` : ""}` : "Cash"}`}
                {open.paid_from === "own" && " · own money"}
              </p>
            </div>
            <ul className="flex flex-col divide-y divide-line">
              {linesOf(open).map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-2">
                  <ItemIcon id={(l.icon as IconId) ?? iconFor(l.title ?? "")} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{l.title}</span>
                    {l.unit_price_kes != null && (
                      <span className="text-xs text-muted tabular">
                        {Number(l.qty_bought ?? 1)} {unitLabel(l.unit, Number(l.qty_bought ?? 1))} × {kes(Number(l.unit_price_kes))}
                      </span>
                    )}
                  </span>
                  {l.total_kes != null && <span className="font-bold tabular">{kes(Number(l.total_kes))}</span>}
                </li>
              ))}
            </ul>
            <p className="flex justify-between border-t border-line pt-3 tabular">
              <span className="text-muted">{Number(open.discount_kes) > 0 ? `Paid (bargained ${kes(Number(open.discount_kes))} off)` : "Paid"}</span>
              <strong>{kes(cost(open))}</strong>
            </p>
            <button
              type="button"
              disabled={!again.length}
              onClick={() => {
                onAgain(open, again);
                setOpen(null);
              }}
              className="min-h-12 rounded-xl bg-brand font-bold text-brand-contrast disabled:opacity-40"
            >
              {again.length ? `Shop this again · add ${again.length === 1 ? "1 thing" : `${again.length} things`} to the list` : "Everything here is already on the list"}
            </button>
          </div>
        </BottomSheet>
      )}
    </section>
  );
}

/** Past shops' buttons: type in a shop from another day (it opens in the basket), or read a receipt. */
export function AddEarlier({ trips, lines, shops, stock, meId }: { trips: Trip[]; lines: TripLine[]; shops: Shop[]; stock: StockItem[]; meId?: string }) {
  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const [picking, setPicking] = useState(false);
  const [reading, setReading] = useState(false);
  const [date, setDate] = useState(today);
  // An earlier shop someone started filling but didn't pay for yet.
  const unfinished = trips.filter((t) => !t.finished_at && !t.deleted_at && t.member_id === meId && !isActive(t) && lines.some((l) => l.trip_id === t.id && !l.deleted_at));

  async function start(shop: Shop) {
    const id = crypto.randomUUID();
    const at = date === today ? new Date().toISOString() : new Date(`${date}T12:00:00+03:00`).toISOString();
    await syncEngine().queue("shopping_trips", "insert", { id, shop_id: shop.id, member_id: meId ?? null, started_at: at, finished_at: null });
    window.location.href = `/shop/basket?trip=${id}`;
  }

  return (
    <div className="flex flex-col gap-2 lg:[column-span:all]">
      {unfinished.map((t) => (
        <a key={t.id} href={`/shop/basket?trip=${t.id}`} className="flex min-h-12 items-center justify-between rounded-xl bg-low-bg px-4 text-sm text-low-fg">
          <span>
            {shops.find((s) => s.id === t.shop_id)?.name ?? "A shop"} on {day(t.started_at)} isn&apos;t paid yet
          </span>
          <strong>Finish ›</strong>
        </a>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setPicking(true)} className="min-h-12 rounded-xl bg-brand px-3 font-bold text-brand-contrast">
          + A shop from another day
        </button>
        <button type="button" onClick={() => setReading((v) => !v)} className="min-h-12 rounded-xl border border-ink px-3 font-bold">
          🧾 Read a receipt
        </button>
      </div>
      {reading && <ReceiptReader stock={stock} shops={shops} meId={meId} onClose={() => setReading(false)} />}
      {picking && (
        <BottomSheet title="A shop from another day" onClose={() => setPicking(false)}>
          <div className="flex flex-col gap-3 pb-2">
            <h2 className="font-display text-2xl">A shop from another day</h2>
            <p className="text-sm text-muted">For things already bought, like the market on Saturday. You add what you bought and how you paid; Money, Stock and the list update for that day.</p>
            <label className="flex flex-col gap-1 text-sm font-bold">
              When
              <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} className="min-h-12 rounded-xl border border-line bg-raised px-3 font-normal" />
            </label>
            <p className="text-sm font-bold">Where</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {sortShops(shops)
                .filter((s) => !["M-Pesa", "Supermarket (either)"].includes(s.name))
                .map((s) => (
                  <button key={s.id} type="button" onClick={() => void start(s)} className="min-h-14 rounded-xl border border-line bg-raised px-3 text-left font-bold hover:border-ink">
                    {s.name}
                  </button>
                ))}
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
