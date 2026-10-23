"use client";

import { useEffect, useState } from "react";
import { kes, optionsFor, pick, storeName, type CatalogMatch, type ListLine, type Store } from "@/lib/shopping/pricing";

/** Keep the screen on while shopping (pushing a trolley), where the phone supports it. */
export function useWakeLock(on: boolean) {
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

/** In the shop: what's in the trolley so far, what's left on the list, and money left this month. */
export function AisleBar({ inTrolley, ticked, total, remaining, moneyLeft, onDone }: { inTrolley: number; ticked: number; total: number; remaining: number; moneyLeft: number | null; onDone: () => void }) {
  return (
    <div className="fixed inset-x-0 z-20 px-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-6 lg:left-56">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-2 rounded-xl bg-ink px-4 py-2 text-sm text-[color:var(--surface-base)] tabular">
        <span>
          <strong>In trolley: {kes(inTrolley)}</strong> ({ticked}/{total})
          <span className="block">
            Left on the list: {kes(remaining)}
            {moneyLeft != null && ` · Money left: ${kes(moneyLeft)}`}
          </span>
        </span>
        <button type="button" onClick={onDone} className="min-h-12 shrink-0 rounded-xl bg-[color:var(--surface-base)] px-3 font-bold text-ink">
          Leave aisle mode
        </button>
      </div>
    </div>
  );
}

/** Shelf empty? The next cheapest brands of the same pack at this store, from the offline prices. */
export function SwapBrand({ line, matches, store, onSwap }: { line: ListLine; matches: CatalogMatch[]; store: Store; onSwap: (m: CatalogMatch) => void }) {
  const [open, setOpen] = useState(false);
  const options = optionsFor(line, matches).filter((m) => m.store === store);
  const current = pick(line, options, store);
  const others = options.filter((o) => o.id !== current?.id).slice(0, 3);
  if (!others.length) return null;
  return (
    <span className="block">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="min-h-10 text-sm font-bold text-brand">
        {open ? "Keep this brand" : "Shelf empty? Swap brand"}
      </button>
      {open && (
        <span className="mt-1 flex flex-col gap-1">
          {others.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onSwap(o);
                setOpen(false);
              }}
              className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-line px-3 text-left text-sm"
            >
              <span>{o.brand ?? o.title}</span>
              <span className="tabular">
                {kes(o.effective_price)} at {storeName(o.store)}
              </span>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
