"use client";

import { useState } from "react";
import { runningLow, type StockLike } from "@/lib/shopping/pricing";
import type { Shop } from "@/lib/shopping/shops";
import type { Row } from "@/lib/sync/tables";

export type Trip = Row & { shop_id: string | null; member_id: string | null; started_at: string; finished_at: string | null };

const ACTIVE_MS = 8 * 60 * 60 * 1000;
export const isActive = (t: Trip) => !t.finished_at && Date.now() - Date.parse(t.started_at) < ACTIVE_MS;

type Props = {
  supermarkets: Shop[];
  trips: Trip[];
  stock: StockLike[];
  onList: (name: string, itemId?: string) => boolean;
  meId?: string;
  nameOf: (memberId: string | null) => string;
  onStart: (shop: Shop, keep: StockLike[]) => void;
  onAdd: (item: StockLike) => void;
  onFinish: (trip: Trip) => void;
};

// Anti-kiosk: before a supermarket top-up, check the fast movers so one trip covers the next few days.
export function TripCheck({ supermarkets, trips, stock, onList, meId, nameOf, onStart, onAdd, onFinish }: Props) {
  const [checking, setChecking] = useState<Shop | null>(null);
  const [keep, setKeep] = useState<Record<string, boolean>>({});

  const active = trips.filter(isActive);
  const mine = active.find((t) => t.member_id === meId);
  const others = active.filter((t) => t.member_id !== meId);
  const low = runningLow(stock).filter((r) => !onList(r.item.name, r.item.id));
  const shopName = (id: string | null) => supermarkets.find((s) => s.id === id)?.name ?? "the shops";

  function start(shop: Shop) {
    if (low.length === 0) return onStart(shop, []);
    setKeep(Object.fromEntries(low.map((r) => [r.item.id, true])));
    setChecking(shop);
  }

  return (
    <div className="flex flex-col gap-3">
      {others.map((t) => (
        <p key={t.id} className="rounded-xl bg-ok-bg px-4 py-3 text-ok-fg">
          <strong>{nameOf(t.member_id)}</strong> is going to {shopName(t.shop_id)}. Add anything you need to the list.
        </p>
      ))}

      {mine ? (
        <section className="rounded-xl border-2 border-brand bg-raised p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold">You&apos;re shopping at {shopName(mine.shop_id)}</h2>
            <button type="button" onClick={() => onFinish(mine)} className="min-h-12 rounded-xl px-3 font-bold text-brand">
              Finish trip
            </button>
          </div>
          {low.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold">Fast movers running low (skip the kiosk)</h3>
                {low.length > 1 && (
                  <button type="button" onClick={() => low.forEach((r) => onAdd(r.item))} className="min-h-12 shrink-0 rounded-xl px-2 font-bold text-brand">
                    + Add all {low.length}
                  </button>
                )}
              </div>
              <ul className="mt-1 flex flex-wrap gap-2">
                {low.map((r) => (
                  <li key={r.item.id}>
                    <button type="button" onClick={() => onAdd(r.item)} className="min-h-12 rounded-full border border-line px-4">
                      + {r.item.name}
                      <span className="text-sm text-muted"> · {r.reason === "unchecked" ? "not checked lately" : r.reason}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : checking ? (
        <section className="rounded-xl border-2 border-brand bg-raised p-4">
          <h2 className="font-bold">Quick check before you head out</h2>
          <p className="text-muted">
            {low.map((r) => r.item.name).join(", ")} {low.length === 1 ? "is" : "are"} running low or not checked lately. Keep them on your trip
            list so we skip the kiosk this week?
          </p>
          <ul className="mt-2 flex flex-col">
            {low.map((r) => (
              <li key={r.item.id}>
                <label className="flex min-h-12 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={keep[r.item.id] ?? false}
                    onChange={(e) => setKeep((k) => ({ ...k, [r.item.id]: e.target.checked }))}
                    className="size-6 accent-[var(--brand)]"
                  />
                  {r.item.name}
                  <span className="text-sm text-muted">{r.reason === "unchecked" ? "not checked lately" : r.reason}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                onStart(checking, low.filter((r) => keep[r.item.id]).map((r) => r.item));
                setChecking(null);
              }}
              className="min-h-12 rounded-xl bg-brand px-4 font-bold text-brand-contrast"
            >
              Add them and go
            </button>
            <button
              type="button"
              onClick={() => {
                onStart(checking, []);
                setChecking(null);
              }}
              className="min-h-12 rounded-xl border border-line px-4 font-bold"
            >
              Just go
            </button>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {supermarkets
            .filter((s) => s.name !== "Supermarket (either)")
            .map((s) => (
              <button key={s.id} type="button" onClick={() => start(s)} className="min-h-12 rounded-xl border border-brand px-3 font-bold text-brand">
                I&apos;m going to {s.name}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
