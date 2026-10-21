"use client";

import { useState } from "react";
import { kes, linePrice, type CatalogMatch, type ListLine, type Store } from "@/lib/shopping/pricing";
import { lineTotal, parseQty, spendByShop, type PutAwayLine } from "@/lib/shopping/stock";
import type { Shop, ShoppingItem, StockItem } from "@/lib/shopping/shops";

const STORE_OF: Record<string, Store | undefined> = { Naivas: "naivas", Quickmart: "quickmart" };

/** Price per unit for a basket line: the shop's catalog price if it's a supermarket, else the usual price. */
function startPrice(line: ListLine, shop: Shop | undefined, matches: CatalogMatch[]): number | null {
  if (!shop) return linePrice(line, matches);
  if (shop.name in STORE_OF) return linePrice(line, matches, STORE_OF[shop.name]);
  if (shop.name === "Supermarket (either)") return linePrice(line, matches);
  return line.item?.usual_price_kes ? Number(line.item.usual_price_kes) : null;
}

type Props = {
  bought: ShoppingItem[];
  stockById: Map<string, StockItem>;
  shops: Shop[];
  matches: CatalogMatch[];
  toLine: (i: ShoppingItem) => ListLine;
  onFixPrice: (itemId: string, price: number) => void;
  onDone: (lines: PutAwayLine[], logSpend: boolean) => void;
  onCancel: () => void;
};

// "Put away" at home: how many of each went into the cupboard, and a spend entry
// filled in from the shop prices. One tap on a price fixes it to the receipt.
export function PutAway({ bought, stockById, shops, matches, toLine, onFixPrice, onDone, onCancel }: Props) {
  const [lines, setLines] = useState<PutAwayLine[]>(() =>
    bought.map((i) => {
      const item = i.item_id ? stockById.get(i.item_id) : undefined;
      return {
        extraId: i.id,
        itemId: item?.id ?? null,
        title: i.title,
        shopId: i.shop_id,
        level: item?.track_mode === "level",
        qty: Number(i.quantity) > 1 ? Number(i.quantity) : (parseQty(i.qty) ?? 1),
        price: startPrice(toLine(i), shops.find((s) => s.id === i.shop_id), matches),
      };
    }),
  );
  const [fixing, setFixing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const set = (id: string, change: Partial<PutAwayLine>) => setLines((ls) => ls.map((l) => (l.extraId === id ? { ...l, ...change } : l)));
  const spend = spendByShop(lines);
  const total = spend.reduce((sum, g) => sum + g.total, 0);
  const shopName = (id: string | null) => shops.find((s) => s.id === id)?.name ?? "Anywhere";
  const unitOf = (l: PutAwayLine) => (l.itemId ? stockById.get(l.itemId)?.unit : undefined);

  function savePrice(l: PutAwayLine) {
    const n = Number(draft.replace(/[, ]/g, ""));
    setFixing(null);
    if (!Number.isFinite(n) || n <= 0) return;
    set(l.extraId, { price: n });
    if (l.itemId) onFixPrice(l.itemId, n);
  }

  return (
    <section aria-labelledby="put-away" className="flex flex-col gap-3 rounded-xl border-2 border-brand bg-raised p-4">
      <h2 id="put-away" className="font-display text-xl">
        Put away
      </h2>
      <p className="text-sm text-muted">Check what went into the cupboard. If the receipt says something different, tap the price.</p>
      <ul className="divide-y divide-line">
        {lines.map((l) => (
          <li key={l.extraId} className="flex flex-col gap-2 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 font-bold">
                {l.title}
                <span className="block text-sm font-normal text-muted">{shopName(l.shopId)}</span>
              </span>
              {l.level ? (
                <span className="text-sm text-muted">Back to OK</span>
              ) : (
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    aria-label={`${l.title} one fewer`}
                    disabled={l.qty <= 0}
                    onClick={() => set(l.extraId, { qty: Math.max(0, l.qty - 1) })}
                    className="flex size-12 items-center justify-center rounded-xl border border-line bg-base text-xl font-bold disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="min-w-12 text-center tabular" aria-live="polite">
                    {l.qty}
                    {unitOf(l) && <span className="block text-xs text-muted">{unitOf(l)}</span>}
                  </span>
                  <button
                    type="button"
                    aria-label={`${l.title} one more`}
                    onClick={() => set(l.extraId, { qty: l.qty + 1 })}
                    className="flex size-12 items-center justify-center rounded-xl border border-line bg-base text-xl font-bold"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
            {fixing === l.extraId ? (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  savePrice(l);
                }}
              >
                <label className="sr-only" htmlFor={`price-${l.extraId}`}>
                  Price of {l.title} in KES
                </label>
                <input
                  id={`price-${l.extraId}`}
                  inputMode="numeric"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="KES"
                  className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-base px-3"
                />
                <button type="submit" className="min-h-12 rounded-xl bg-brand px-4 font-bold text-brand-contrast">
                  Fix
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDraft(l.price ? String(l.price) : "");
                  setFixing(l.extraId);
                }}
                aria-label={l.price ? `${l.title}: ${kes(l.price)}${l.level ? "" : " each"}, ${kes(lineTotal(l))} in all. Fix price` : `Add the price of ${l.title}`}
                className="min-h-12 self-start text-left text-sm tabular"
              >
                {l.price ? (
                  <>
                    {kes(l.price)}
                    {!l.level && " each"} · <strong>{kes(lineTotal(l))}</strong> <span className="font-bold text-brand">Fix price</span>
                  </>
                ) : (
                  <span className="font-bold text-brand">Add the price</span>
                )}
              </button>
            )}
          </li>
        ))}
      </ul>

      {spend.length > 1 && (
        <ul className="text-sm tabular">
          {spend.map((g) => (
            <li key={g.shopId ?? "none"}>
              {shopName(g.shopId)}: {kes(g.total)}
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={() => onDone(lines, true)} disabled={total <= 0} className="min-h-12 rounded-xl bg-brand font-bold text-brand-contrast disabled:opacity-50">
        Put away · log {kes(total)} spent
      </button>
      <div className="flex justify-between gap-2">
        <button type="button" onClick={() => onDone(lines, false)} className="min-h-12 rounded-xl px-2 font-bold text-brand">
          Put away, no spend
        </button>
        <button type="button" onClick={onCancel} className="min-h-12 rounded-xl px-2 font-bold text-muted">
          Not yet
        </button>
      </div>
    </section>
  );
}
