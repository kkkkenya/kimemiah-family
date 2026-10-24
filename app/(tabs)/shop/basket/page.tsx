"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { Screen } from "@/components/Screen";
import { useSync } from "@/components/SyncProvider";
import { UndoBar, type UndoState } from "@/components/UndoBar";
import { ItemIcon } from "@/components/shop/ItemIcon";
import { parseMpesa } from "@/lib/money/mpesa";
import { checkPayment, iconFor, isActive, kindNameFor, lineTotal, placeOf, priceBook, priceFor, spreadToPaid, unitPrice, UNITS, SHARED_SMS, unitLabel, type IconId, type PriceNote, type Trip, type TripLine } from "@/lib/shopping/market";
import { autoListItems } from "@/lib/shopping/stock";
import { kes, type StockLike } from "@/lib/shopping/pricing";
import type { ShoppingItem, StockItem } from "@/lib/shopping/shops";
import { useStock } from "@/lib/shopping/useStock";
import { localDB, syncEngine } from "@/lib/sync/client";
import { useRows } from "@/lib/sync/hooks";
import { finishShop, FOOD_KIND, type ShopLine } from "@/lib/sync/workflows";

const NONE: never[] = [];
type Item = ShoppingItem & { urgent?: boolean };
type Draft = { title: string; item_id: string | null; extra_id: string | null; qty: number; unit: string; unit_price_kes: number; total_kes: number; line?: TripLine };

function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const take = () =>
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => undefined);
    void take();
    // The lock drops when the app goes to the background; take it again on return.
    const again = () => document.visibilityState === "visible" && void take();
    document.addEventListener("visibilitychange", again);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", again);
      void lock?.release();
    };
  }, [on]);
}

// The basket, while you're out shopping. Tap something on the list, say how many and the price
// (per kg, per bunch, or what you paid for the lot), and it drops in. At the end, pay: paste the
// M-Pesa message (it fills the amount for you) or type what you paid in cash. Stock, Money and
// the list all update at once.
export default function BasketPage() {
  const router = useRouter();
  const { syncNow } = useSync();
  const { me, shops, stock } = useStock();
  const trips = (useRows<Trip & { id: string }>("shopping_trips") ?? []) as Trip[];
  const allLines = (useRows<TripLine>("trip_lines") ?? NONE) as TripLine[];
  const items = (useRows<Item>("shopping_extras") ?? []) as Item[];
  // /shop/basket?trip=<id> opens a shop from an earlier day (from Past shops); otherwise my shop now.
  const [tripParam, setTripParam] = useState<string | null>(null);
  useEffect(() => setTripParam(new URLSearchParams(window.location.search).get("trip")), []);
  const trip = tripParam ? trips.find((t) => t.id === tripParam && !t.finished_at && !t.deleted_at) : trips.find((t) => isActive(t) && t.member_id === me?.id);
  const shop = shops.find((s) => s.id === trip?.shop_id);
  const place = placeOf(shop);
  const day = trip ? new Date(Date.parse(trip.started_at) + 3 * 3600_000).toISOString().slice(0, 10) : "";
  const earlier = !!trip && day < new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  useWakeLock(!!trip && !earlier);

  const [buying, setBuying] = useState<Draft | null>(null);
  const [paying, setPaying] = useState(false);
  const [leftover, setLeftover] = useState<Item[] | null>(null);
  const [undo, setUndo] = useState<UndoState>(null);

  // An M-Pesa message shared into the app while shopping opens the pay sheet with it.
  const hasTrip = !!trip;
  useEffect(() => {
    try {
      if (hasTrip && sessionStorage.getItem(SHARED_SMS)) setPaying(true);
    } catch {}
  }, [hasTrip]);

  const lines = allLines.filter((l) => trip && l.trip_id === trip.id);
  const book = useMemo(() => priceBook(allLines.map((l) => ({ title: l.title ?? "", item_id: l.item_id, unit: l.unit, unit_price_kes: l.unit_price_kes, created_at: l.created_at, deleted_at: l.deleted_at }))), [allLines]);
  const stockById = new Map(stock.map((s) => [s.id, s]));
  const auto: Item[] = autoListItems(stock as (StockItem & StockLike)[], items).map((s) => ({ id: `auto:${s.id}`, title: s.name, qty: null, shop_id: s.shop_id, item_id: s.id, bought_at: null, shopping_tier: s.shopping_tier, auto: true }));
  const inBasket = (i: Item) => lines.some((l) => (l.extra_id && l.extra_id === i.id) || (i.item_id && l.item_id === i.item_id) || (l.title ?? "").toLowerCase() === i.title.toLowerCase());
  const needed = [...auto, ...items.filter((i) => !i.bought_at && i.shopping_tier !== "qol")].filter((i) => !inBasket(i));
  const placeOfItem = (i: Item) => placeOf(shops.find((s) => s.id === i.shop_id));
  const here = needed.filter((i) => i.shop_id === trip?.shop_id || placeOfItem(i) === place || !i.shop_id).sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent));
  const elsewhere = needed.filter((i) => !here.includes(i));
  const total = lines.reduce((s, l) => s + Number(l.total_kes ?? 0), 0);
  const iconOf = (title: string, itemId: string | null) => iconFor(title, itemId ? stockById.get(itemId)?.category : null);

  function startBuy(i: Item) {
    const note = priceFor(book, { title: i.title, item_id: i.item_id });
    const usual = i.item_id ? Number(stockById.get(i.item_id)?.usual_price_kes ?? 0) : 0;
    const price = note?.last ?? usual;
    const qty = Math.max(1, Number(i.quantity ?? 1));
    setBuying({ title: i.title, item_id: i.item_id, extra_id: i.auto ? null : i.id, qty, unit: note?.unit ?? "piece", unit_price_kes: price, total_kes: lineTotal(qty, price) });
  }

  async function saveLine(d: Draft) {
    const row = { title: d.title.trim(), item_id: d.item_id, extra_id: d.extra_id, qty_bought: d.qty, unit: d.unit, unit_price_kes: d.unit_price_kes, total_kes: d.total_kes, icon: iconOf(d.title, d.item_id) };
    if (d.line) await syncEngine().queue("trip_lines", "update", { id: d.line.id, ...row });
    else await syncEngine().queue("trip_lines", "insert", { id: crypto.randomUUID(), trip_id: trip!.id, ticked_at: new Date().toISOString(), ...row });
    void syncNow();
    setBuying(null);
  }

  async function removeLine(l: TripLine) {
    await syncEngine().queue("trip_lines", "delete", { id: l.id });
    void syncNow();
    setBuying(null);
    setUndo({ id: Date.now(), message: `${l.title} out of the basket` });
  }

  async function cancelShop() {
    if (!trip) return;
    for (const l of lines) await syncEngine().queue("trip_lines", "delete", { id: l.id });
    await syncEngine().queue("shopping_trips", "delete", { id: trip.id });
    void syncNow();
    router.push("/shop");
  }

  if (!trip) {
    return (
      <Screen title="Basket" back="/shop">
        <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-muted">
          You&apos;re not out shopping right now. Start from the list with <strong className="text-ink">I&apos;m going shopping</strong>.
        </p>
        <Link href="/shop" className="flex min-h-12 items-center justify-center rounded-xl bg-brand font-bold text-brand-contrast">
          Back to the list
        </Link>
      </Screen>
    );
  }

  const card = (i: Item) => (
    <li key={i.id}>
      <button type="button" onClick={() => startBuy(i)} className="flex h-full min-h-28 w-full flex-col items-start justify-between gap-2 rounded-2xl border border-line bg-raised p-3 text-left hover:border-ink">
        <ItemIcon id={iconOf(i.title, i.item_id)} size={44} />
        <span className="w-full">
          <span className="line-clamp-2 font-bold leading-snug">{i.title}</span>
          <span className="block text-xs text-muted">
            {i.urgent ? "⚡ Needed soon" : i.qty ? i.qty : (i.quantity ?? 1) > 1 ? `× ${i.quantity}` : i.auto ? "Low at home" : "Tap to add"}
          </span>
        </span>
      </button>
    </li>
  );

  return (
    <Screen title="Basket" back="/shop">
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-ink p-4 text-raised">
        <span>
          <span className="block text-xs uppercase tracking-wider opacity-80">{earlier ? `Shop on ${new Date(trip.started_at).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Nairobi" })} at` : "Shopping at"}</span>
          <span className="text-xl font-bold">{shop?.name ?? "the shops"}</span>
        </span>
        <button type="button" onClick={() => void cancelShop()} className="min-h-11 rounded-xl border border-raised/40 px-3 text-sm font-bold">
          Cancel shop
        </button>
      </div>

      <section aria-labelledby="to-get" className="flex flex-col gap-3">
        <h2 id="to-get" className="font-display text-xl">
          To get here {here.length > 0 && <span className="text-sm text-muted">({here.length})</span>}
        </h2>
        {here.length ? <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">{here.map(card)}</ul> : <p className="text-sm text-muted">Nothing left on the list for here.</p>}
        <button
          type="button"
          onClick={() => setBuying({ title: "", item_id: null, extra_id: null, qty: 1, unit: "piece", unit_price_kes: 0, total_kes: 0 })}
          className="min-h-12 rounded-xl border border-dashed border-ink font-bold"
        >
          + Something not on the list
        </button>
        {elsewhere.length > 0 && (
          <details className="rounded-2xl border border-line bg-raised">
            <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-bold">On the list for other places ({elsewhere.length})</summary>
            <ul className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">{elsewhere.map(card)}</ul>
          </details>
        )}
      </section>

      <section aria-labelledby="in-basket" className="overflow-hidden rounded-2xl border border-line bg-raised">
        <header className="flex items-baseline justify-between px-4 pb-1 pt-4">
          <h2 id="in-basket" className="font-display text-xl">
            In the basket
          </h2>
          <span className="text-sm text-muted tabular">{lines.length === 1 ? "1 thing" : `${lines.length} things`}</span>
        </header>
        {lines.length ? (
          <ul className="divide-y divide-line">
            {lines.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => setBuying({ title: l.title ?? "", item_id: l.item_id, extra_id: l.extra_id, qty: Number(l.qty_bought ?? 1), unit: l.unit ?? "piece", unit_price_kes: Number(l.unit_price_kes ?? 0), total_kes: Number(l.total_kes ?? 0), line: l })}
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left hover:bg-base"
                >
                  <ItemIcon id={(l.icon as IconId) ?? iconOf(l.title ?? "", l.item_id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{l.title}</span>
                    <span className="text-xs text-muted tabular">
                      {Number(l.qty_bought ?? 1)} {unitLabel(l.unit, Number(l.qty_bought ?? 1))} × {kes(Number(l.unit_price_kes ?? 0))}
                    </span>
                  </span>
                  <span className="shrink-0 font-bold tabular">{kes(Number(l.total_kes ?? 0))}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 pb-4 text-sm text-muted">Empty. Tap something above as you pick it up.</p>
        )}
      </section>

      <div className="h-20" aria-hidden="true" />
      <div className="fixed inset-x-0 z-20 px-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-6 lg:left-56">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-2 text-raised shadow-lg lg:max-w-3xl">
          <span className="tabular">
            <span className="block text-xs opacity-80">{lines.length === 1 ? "1 thing" : `${lines.length} things`}</span>
            <strong className="text-xl">{kes(total)}</strong>
          </span>
          <button type="button" disabled={!lines.length} onClick={() => setPaying(true)} className="min-h-12 rounded-xl bg-brand px-6 font-bold text-brand-contrast disabled:opacity-40">
            Pay and finish
          </button>
        </div>
      </div>

      {buying && <BuySheet draft={buying} note={priceFor(book, { title: buying.title, item_id: buying.item_id })} onClose={() => setBuying(null)} onSave={saveLine} onRemove={buying.line ? () => void removeLine(buying.line!) : undefined} />}

      {paying && (
        <PaySheet
          lines={lines}
          shopName={shop?.name ?? "Shop"}
          onClose={() => setPaying(false)}
          onPay={async (pay, final, discount, smsDay) => {
            const kinds = (await localDB().rows("budget_categories").toArray()) as unknown as { id: string; name: string; deleted_at?: string | null }[];
            const kindId = kinds.find((k) => !k.deleted_at && k.name === kindNameFor(place))?.id ?? FOOD_KIND;
            const shopLines: ShopLine[] = final.map((l) => ({ id: l.id, extra_id: l.extra_id, item_id: l.item_id, title: l.title ?? "", qty: Number(l.qty_bought ?? 1), unit: l.unit ?? "piece", unit_price_kes: Number(l.unit_price_kes ?? 0), total_kes: Number(l.total_kes ?? 0) }));
            const r = await finishShop({ id: trip.id, shop_id: trip.shop_id }, shopLines, pay, { meId: me?.id, kindId, shopName: shop?.name ?? "Shop", discount, occurredOn: smsDay ?? (earlier ? day : undefined) });
            if (r.error) return r.error;
            void syncNow();
            setPaying(false);
            // What was on the list for here but didn't come home: keep it or drop it.
            const bought = new Set(final.map((l) => l.extra_id).filter(Boolean));
            const still = here.filter((i) => !i.auto && !bought.has(i.id));
            if (still.length) setLeftover(still);
            else router.push("/shop?done=1");
            return null;
          }}
        />
      )}

      {leftover && (
        <BottomSheet title="Didn't come home" onClose={() => router.push("/shop")}>
          <div className="flex flex-col gap-3 pb-2">
            <h2 className="font-display text-2xl">Done. Still on the list:</h2>
            <p className="text-sm text-muted">These weren&apos;t bought. Keep them for next time, or drop the ones you don&apos;t need.</p>
            <ul className="flex flex-col divide-y divide-line">
              {leftover.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex items-center gap-3">
                    <ItemIcon id={iconOf(i.title, i.item_id)} size={32} />
                    {i.title}
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      await syncEngine().queue("shopping_extras", "delete", { id: i.id });
                      void syncNow();
                      const rest = leftover.filter((x) => x.id !== i.id);
                      if (rest.length) setLeftover(rest);
                      else router.push("/shop");
                    }}
                    className="min-h-10 shrink-0 rounded-xl border border-line px-4 text-sm font-bold"
                  >
                    Drop
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => router.push("/shop")} className="min-h-12 rounded-xl bg-brand font-bold text-brand-contrast">
              Keep the rest
            </button>
          </div>
        </BottomSheet>
      )}
      <UndoBar state={undo} onClose={() => setUndo(null)} />
    </Screen>
  );
}

const field = "min-h-12 w-full rounded-xl border border-line bg-raised px-3";

/** How many, the unit, and the price: per unit, or what was paid for the lot (the other follows). */
function BuySheet({ draft, note, onClose, onSave, onRemove }: { draft: Draft; note?: PriceNote; onClose: () => void; onSave: (d: Draft) => void; onRemove?: () => void }) {
  const [title, setTitle] = useState(draft.title);
  const [qty, setQty] = useState(draft.qty);
  const [unit, setUnit] = useState(draft.unit);
  const [by, setBy] = useState<"unit" | "total">("unit");
  const [price, setPrice] = useState(draft.unit_price_kes ? String(draft.unit_price_kes) : "");
  const [lot, setLot] = useState(draft.total_kes ? String(draft.total_kes) : "");
  const each = by === "unit" ? Number(price) || 0 : unitPrice(Number(lot) || 0, qty);
  const sum = by === "unit" ? lineTotal(qty, Number(price) || 0) : Math.round(Number(lot) || 0);
  const step = unit === "kg" ? 0.5 : 1;
  const ok = title.trim() && qty > 0 && sum > 0;

  return (
    <BottomSheet title={draft.title || "Something else"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onSave({ ...draft, title, qty, unit, unit_price_kes: each, total_kes: sum });
        }}
        className="flex flex-col gap-4 pb-2"
      >
        <div className="flex items-center gap-3">
          <ItemIcon id={iconFor(title || "x")} size={52} />
          {draft.title ? (
            <h2 className="font-display text-2xl">{draft.title}</h2>
          ) : (
            <label className="flex-1">
              <span className="sr-only">What is it</span>
              <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is it? e.g. Avocados" className={field} />
            </label>
          )}
        </div>

        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-bold">How many</span>
            <div className="flex items-center rounded-xl border border-line">
              <button type="button" aria-label="Fewer" onClick={() => setQty((q) => Math.max(step, Math.round((q - step) * 100) / 100))} className="size-12 text-xl">
                −
              </button>
              <input aria-label="How many" inputMode="decimal" value={qty} onChange={(e) => setQty(Number(e.target.value.replace(",", ".")) || 0)} className="h-12 w-14 bg-transparent text-center text-lg font-bold tabular" />
              <button type="button" aria-label="More" onClick={() => setQty((q) => Math.round((q + step) * 100) / 100)} className="size-12 text-xl">
                +
              </button>
            </div>
          </div>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-bold">
            Unit
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className={`${field} font-normal`}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div role="radiogroup" aria-label="Price" className="grid grid-cols-2 gap-1 rounded-xl border border-line p-1">
          {(
            [
              ["unit", `Price per ${unit}`],
              ["total", "Paid for the lot"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={by === v} onClick={() => setBy(v)} className={`min-h-11 rounded-lg text-sm font-bold ${by === v ? "bg-ink text-raised" : ""}`}>
              {label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-sm font-bold">
          {by === "unit" ? `KES per ${unit}` : `KES for all ${qty}`}
          <input
            inputMode="numeric"
            value={by === "unit" ? price : lot}
            onChange={(e) => (by === "unit" ? setPrice : setLot)(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0"
            className={`${field} text-2xl font-bold tabular`}
          />
        </label>
        {note && (
          <p className="text-sm text-muted">
            Last time {kes(note.last)} per {note.unit}
            {note.times > 1 && note.low !== note.high ? ` · usually ${kes(note.low)}–${kes(note.high)}` : ""}
          </p>
        )}
        <p className="flex items-baseline justify-between rounded-xl bg-base px-4 py-3 tabular">
          <span className="text-sm text-muted">
            {qty} {unitLabel(unit, qty)} × {kes(each)}
          </span>
          <strong className="text-xl">{kes(sum)}</strong>
        </p>
        <button type="submit" disabled={!ok} className="min-h-12 rounded-xl bg-brand font-bold text-brand-contrast disabled:opacity-40">
          {draft.line ? "Save" : "Into the basket"}
        </button>
        {onRemove && (
          <button type="button" onClick={onRemove} className="min-h-11 text-sm font-bold text-muted underline underline-offset-4">
            Take it out of the basket
          </button>
        )}
      </form>
    </BottomSheet>
  );
}

type Pay = { paid: number; method: "mpesa" | "cash"; mpesa_code?: string | null; counterparty?: string | null; paid_from: "house" | "own" };

/** Paying: paste the M-Pesa message (the amount fills itself) or type the cash. Checked against the basket. */
function PaySheet({ lines, shopName, onClose, onPay }: { lines: TripLine[]; shopName: string; onClose: () => void; onPay: (p: Pay, final: TripLine[], discount: number, smsDay: string | null) => Promise<string | null> }) {
  const basket = lines.map((l) => ({ ...l, qty: Number(l.qty_bought ?? 1), unit: l.unit ?? "piece", title: l.title ?? "", unit_price_kes: Number(l.unit_price_kes ?? 0), total_kes: Number(l.total_kes ?? 0) }));
  const [method, setMethod] = useState<"mpesa" | "cash">("mpesa");
  const [sms, setSms] = useState("");
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState<"house" | "own">("house");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A message shared into the app from the SMS app is waiting: use it.
  useEffect(() => {
    try {
      const shared = sessionStorage.getItem(SHARED_SMS);
      if (shared) {
        setSms(shared);
        sessionStorage.removeItem(SHARED_SMS);
      }
    } catch {}
  }, []);

  const parsed = method === "mpesa" && sms.trim() ? parseMpesa(sms) : null;
  const paid = parsed?.amount ?? (Number(amount) || (method === "cash" ? 0 : 0));
  const check = checkPayment(basket, paid);
  const total = checkPayment(basket, 0).basket;

  async function finish() {
    setBusy(true);
    setError(null);
    const final = check.state === "less" ? spreadToPaid(basket, paid) : basket;
    const err = await onPay(
      { paid, method, mpesa_code: parsed?.code ?? null, counterparty: parsed?.counterparty ?? (method === "cash" ? shopName : null), paid_from: from },
      final.map((l) => ({ ...l, qty_bought: l.qty })),
      check.state === "less" ? check.diff : 0,
      parsed?.date ?? null,
    );
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <BottomSheet title="Pay and finish" onClose={onClose}>
      <div className="flex flex-col gap-4 pb-2">
        <h2 className="font-display text-2xl">Pay and finish</h2>
        <p className="flex items-baseline justify-between tabular">
          <span className="text-muted">Basket</span>
          <strong className="text-xl">{kes(total)}</strong>
        </p>

        <div role="radiogroup" aria-label="How you paid" className="grid grid-cols-2 gap-1 rounded-xl border border-line p-1">
          {(
            [
              ["mpesa", "M-Pesa"],
              ["cash", "Cash"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={method === v} onClick={() => setMethod(v)} className={`min-h-11 rounded-lg font-bold ${method === v ? "bg-ink text-raised" : ""}`}>
              {label}
            </button>
          ))}
        </div>

        {method === "mpesa" ? (
          <>
            <label className="flex flex-col gap-1 text-sm font-bold">
              Paste the M-Pesa message
              <span className="font-normal text-muted">The quickest way to set the amount: copy the confirmation SMS and paste it here. Nothing to type.</span>
              <textarea value={sms} onChange={(e) => setSms(e.target.value)} rows={3} placeholder="e.g. TJK4XXXXXX Confirmed. Ksh320.00 paid to…" className="rounded-xl border border-line bg-raised p-3 font-normal" />
            </label>
            {sms.trim() && !parsed && <p className="text-sm text-out-fg">That doesn&apos;t look like an M-Pesa confirmation. Paste the whole message, or type the amount below.</p>}
            {parsed && (
              <p className="rounded-xl bg-ok-bg px-4 py-3 text-sm text-ok-fg">
                ✓ {kes(parsed.amount)} {parsed.counterparty ? `to ${parsed.counterparty}` : ""} · code {parsed.code}
              </p>
            )}
            {!parsed && (
              <label className="flex flex-col gap-1 text-sm font-bold">
                Or type the amount
                <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder={String(total)} className={`${field} text-xl font-bold tabular`} />
              </label>
            )}
          </>
        ) : (
          <label className="flex flex-col gap-1 text-sm font-bold">
            Cash paid
            <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder={String(total)} className={`${field} text-xl font-bold tabular`} />
            <button type="button" onClick={() => setAmount(String(total))} className="self-start text-sm font-bold text-brand underline underline-offset-4">
              Same as the basket ({kes(total)})
            </button>
          </label>
        )}

        {paid > 0 && (
          <p
            className={`rounded-xl px-4 py-3 text-sm ${check.state === "match" ? "bg-ok-bg text-ok-fg" : check.state === "less" ? "bg-base" : "bg-low-bg text-low-fg"}`}
          >
            {check.state === "match" && "✓ Matches the basket."}
            {check.state === "less" && `You paid ${kes(check.diff)} less than the basket. Bargained? The ${kes(check.diff)} is shared across the items so the prices are what you really paid.`}
            {check.state === "more" && `You paid ${kes(check.diff)} more than the basket. Missed something? Add it to the basket first, or finish anyway.`}
          </p>
        )}

        <div role="radiogroup" aria-label="Whose money" className="grid grid-cols-2 gap-2">
          {(
            [
              ["house", "House money"],
              ["own", "My own money"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={from === v} onClick={() => setFrom(v)} className={`min-h-12 rounded-xl border text-sm font-bold ${from === v ? "border-ink bg-ink text-raised" : "border-line"}`}>
              {label}
            </button>
          ))}
        </div>
        {from === "own" && <p className="-mt-2 text-xs text-muted">The house then owes you this. It shows on Money under settle up.</p>}

        {error && <p className="text-sm text-out-fg">{error}</p>}
        <button type="button" disabled={busy || paid <= 0} onClick={() => void finish()} className="min-h-14 rounded-xl bg-brand text-lg font-bold text-brand-contrast disabled:opacity-40">
          {busy ? "Saving…" : `Done · ${kes(paid || total)}`}
        </button>
        <p className="text-center text-xs text-muted">Logs the spend on Money, adds house things to Stock and takes them off the list.</p>
      </div>
    </BottomSheet>
  );
}
