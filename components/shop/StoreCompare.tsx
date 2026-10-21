"use client";

import { useState } from "react";
import { kes, smartSplit, storeName, storeTotals, type CatalogMatch, type ListLine } from "@/lib/shopping/pricing";

// Supermarket basket for the items in the current mode: each store with online prices (only
// Quickmart while Naivas blocks price collection), plus a split run when both have prices and it saves enough.
export function StoreCompare({ lines, matches }: { lines: ListLine[]; matches: CatalogMatch[] }) {
  const [showSplit, setShowSplit] = useState(false);
  const totals = storeTotals(lines, matches);
  if (totals.every((t) => t.priced === 0)) return null;
  const priced = totals.filter((t) => t.priced > 0);
  const winner = priced.length === 2 ? (priced[0].total <= priced[1].total ? priced[0] : priced[1]) : null;
  const split = smartSplit(lines, matches);

  return (
    <section aria-label="Supermarket comparison" className="rounded-xl border border-line bg-raised p-4">
      <h2 className="font-bold">Supermarket basket</h2>
      <ul className={`mt-2 grid gap-2 ${priced.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {priced.map((t) => (
          <li key={t.store} className={`rounded-xl p-3 ${winner?.store === t.store ? "bg-ok-bg text-ok-fg" : "bg-base"}`}>
            <span className="block text-sm font-bold">{storeName(t.store)}</span>
            <span className="block text-lg font-bold tabular">{kes(t.total)}</span>
            <span className="block text-sm">
              {t.deals ? `${t.deals} on sale · saves ${kes(t.saves)}` : "No deals this week"}
              {t.missing ? ` · ${t.missing} not found` : ""}
            </span>
          </li>
        ))}
      </ul>
      {split && (
        <div className="mt-2">
          <button type="button" aria-expanded={showSplit} onClick={() => setShowSplit((v) => !v)} className="min-h-12 font-bold text-brand">
            Split the run and save {kes(split.saving)}
          </button>
          {showSplit && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <p>
                <strong>Naivas:</strong> {split.atNaivas.join(", ")}
              </p>
              <p>
                <strong>Quickmart:</strong> {split.atQuickmart.join(", ")}
              </p>
            </div>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-muted">Online prices, updated every Friday. Shelf prices can differ by branch.</p>
    </section>
  );
}
