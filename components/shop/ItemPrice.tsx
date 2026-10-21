"use client";

import { useState } from "react";
import {
  bulkValue,
  familyFor,
  kes,
  optionsFor,
  pick,
  rivalDeal,
  storeName,
  type CatalogMatch,
  type ListLine,
  type Store,
} from "@/lib/shopping/pricing";

const perUnit = (m: CatalogMatch) =>
  m.unit_price == null ? "" : ` · ${kes(m.unit_price)}/${m.normalized_unit === "kg" ? "kg" : m.normalized_unit === "liter" ? "L" : "pc"}`;

const label = (m: CatalogMatch) => [m.brand, m.pack_size_label?.toLowerCase()].filter(Boolean).join(" ") || m.title;

// Best brand and store for one list item, the other store's price, deal and bulk tips,
// and a drawer with every brand and pack size (works offline).
export function ItemPrice({ line, matches }: { line: ListLine; matches: CatalogMatch[] }) {
  const [open, setOpen] = useState(false);
  const options = optionsFor(line, matches);
  const best = pick(line, options);
  const usual = line.item?.usual_price_kes;

  if (!best) {
    return usual ? <span className="block text-sm text-muted tabular">Usual: {kes(usual)}</span> : null;
  }

  const other: Store = best.store === "naivas" ? "quickmart" : "naivas";
  const otherPick = pick(line, options, other);
  const rival = rivalDeal(line, options);
  const bulk = bulkValue(line, matches);
  const family = familyFor(line, matches);

  return (
    <span className="mt-1 block text-sm">
      <span className="block tabular">
        <strong>Best:</strong> {label(best)} · {kes(best.effective_price)} at {storeName(best.store)}
        {best.is_on_sale && best.sale_price != null && (
          <span className="ml-1 rounded-md bg-ok-bg px-1.5 font-bold text-ok-fg">
            {storeName(best.store)} sale · was {kes(best.regular_price)}
          </span>
        )}
      </span>
      <span className="block text-muted tabular">
        {[otherPick ? `${storeName(other)}: ${label(otherPick)} · ${kes(otherPick.effective_price)}` : null, usual ? `Usual: ${kes(usual)}` : null]
          .filter(Boolean)
          .join(" · ")}
      </span>
      {rival && (
        <span className="block text-ok-fg">
          Deal: {label(rival)} is {Math.round(rival.discount_pct)}% off at {storeName(rival.store)} ({kes(rival.effective_price)})
        </span>
      )}
      {bulk && (
        <span className="block text-ok-fg">
          Bulk value: {label(bulk.option)} is {bulk.savingPct}% cheaper per {bulk.option.normalized_unit === "kg" ? "kg" : bulk.option.normalized_unit === "liter" ? "litre" : "piece"} at {storeName(bulk.option.store)}
        </span>
      )}
      {family.length > 1 && (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            className="min-h-10 font-bold text-brand"
          >
            {open ? "Hide brands" : `Compare ${family.length} brands and sizes`}
          </button>
          {open && (
            <span className="block overflow-hidden rounded-xl border border-line">
              {(["naivas", "quickmart"] as Store[]).map((store) => {
                const rows = family.filter((m) => m.store === store).sort((a, b) => a.effective_price - b.effective_price);
                if (!rows.length) return null;
                return (
                  <span key={store} className="block">
                    <span className="block bg-base px-3 py-1 font-bold">{storeName(store)}</span>
                    {rows.map((m) => (
                      <span key={m.id} className="flex justify-between gap-2 border-t border-line px-3 py-1.5 tabular">
                        <span className="min-w-0">{label(m)}</span>
                        <span className="shrink-0 text-right">
                          {kes(m.effective_price)}
                          {m.is_on_sale && <span className="text-ok-fg"> −{Math.round(m.discount_pct)}%</span>}
                          <span className="block text-xs text-muted">{perUnit(m).replace(" · ", "")}</span>
                        </span>
                      </span>
                    ))}
                  </span>
                );
              })}
            </span>
          )}
        </>
      )}
    </span>
  );
}
