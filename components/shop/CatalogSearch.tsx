"use client";

import { useState, type FormEvent } from "react";
import { useSync } from "@/components/SyncProvider";
import { kes, storeName, type CatalogMatch } from "@/lib/shopping/pricing";
import { supabase } from "@/lib/supabase/client";

// Search the full Naivas / Quickmart catalog (online only), e.g. a wine, spice or broom not on the house list.
export function CatalogSearch({ onAdd }: { onAdd: (product: CatalogMatch) => void }) {
  const { online } = useSync();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CatalogMatch[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term.length < 2) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase()
      .from("catalog_products")
      .select("*")
      .ilike("title", `%${term.replace(/[%_]/g, "")}%`)
      .eq("in_stock", true)
      .order("effective_price")
      .limit(25);
    setBusy(false);
    if (error) return setError("Search didn't work. Check your connection.");
    setResults((data ?? []) as CatalogMatch[]);
  }

  return (
    <section className="rounded-xl bg-raised p-4 shadow-[0_1px_3px_rgba(10,51,35,.10)]">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex min-h-12 w-full items-center justify-between font-bold">
        Search the supermarket catalog
        <span aria-hidden="true" className="text-muted">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {!online && <p className="text-sm text-low-fg">Searching the full catalog needs signal. Prices for your list still work offline.</p>}
          <form onSubmit={search} className="flex gap-2">
            <input
              id="catalog-q"
              aria-label="Search products"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. red wine, broom, pilau masala"
              className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-base px-3"
            />
            <button type="submit" disabled={!online || busy || q.trim().length < 2} className="min-h-12 rounded-xl bg-brand px-4 font-bold text-brand-contrast disabled:opacity-50">
              {busy ? "…" : "Search"}
            </button>
          </form>
          {error && <p className="text-sm text-out-strong">{error}</p>}
          {results && results.length === 0 && <p className="text-sm text-muted">Nothing found. Try a shorter word.</p>}
          {results && results.length > 0 && (
            <ul className="divide-y divide-line">
              {results.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 text-sm">
                    <span className="block font-bold">{p.title}</span>
                    <span className="block tabular">
                      {kes(p.effective_price)} at {storeName(p.store)}
                      {p.is_on_sale && <span className="text-ok-fg"> · −{Math.round(p.discount_pct)}%</span>}
                    </span>
                  </span>
                  <button type="button" onClick={() => onAdd(p)} className="min-h-12 shrink-0 rounded-xl border border-line px-3 font-bold">
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
