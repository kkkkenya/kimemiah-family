"use client";

import { useState } from "react";
import { dealRestock, kes, storeName, type CatalogMatch, type StockLike } from "@/lib/shopping/pricing";

// Staples that are fine at home but 15%+ off this week: worth restocking before prices go back up.
export function DealRestock({ stock, matches, onList, onAdd }: { stock: StockLike[]; matches: CatalogMatch[]; onList: (name: string, id?: string) => boolean; onAdd: (item: StockLike, deal: CatalogMatch) => void }) {
  const [open, setOpen] = useState(false);
  const deals = dealRestock(stock, matches).filter((d) => !onList(d.item.name, d.item.id));
  if (deals.length === 0) return null;

  return (
    <section className="rounded-2xl bg-raised p-4 border border-line">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex min-h-12 w-full items-center justify-between font-bold">
        Tracked staples on offer this week ({deals.length})
        <span aria-hidden="true" className="text-muted">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <ul className="mt-1 divide-y divide-line">
          {deals.map(({ item, deal }) => (
            <li key={item.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0 text-sm">
                <span className="block font-bold">{item.name}</span>
                <span className="block tabular">
                  {deal.brand} {deal.pack_size_label?.toLowerCase()} · {kes(deal.effective_price)} at {storeName(deal.store)}{" "}
                  <span className="text-ok-fg">−{Math.round(deal.discount_pct)}%</span>
                </span>
              </span>
              <button type="button" onClick={() => onAdd(item, deal)} className="min-h-12 shrink-0 rounded-xl border border-line px-3 font-bold">
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
