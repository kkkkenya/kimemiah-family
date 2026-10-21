"use client";

// Steps that touch several tabs at once, queued together so every tab updates from one tap
// (Stock, Shop, Jobs and the spend log), offline too.

import { putAwayMovements, spendByShop, type PutAwayLine } from "@/lib/shopping/stock";
import type { Job } from "@/lib/jobs/logic";
import { localDB, syncEngine } from "./client";

const nairobiToday = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

export type RestockOptions = {
  meId?: string | null;
  logSpend: boolean;
  tripId?: string | null;
  /** From a receipt: one spend entry for the receipt total at this shop, instead of one per shop from line prices. */
  receipt?: { shopId: string | null; total: number; note: string };
  /** Save each line's price as the item's usual price. */
  savePrices?: boolean;
  /** Basket rows to clear once they're put away. */
  extraIds?: string[];
};

/**
 * Shopping done (or a receipt read): bought amounts go into stock, OK / Low / Out items go back
 * to OK, prices are saved, the spend is logged, the basket is cleared, the trip is finished and
 * today's supermarket or market run job is marked done.
 */
export async function restockHouse(lines: PutAwayLine[], o: RestockOptions): Promise<{ spent: number; runsDone: number }> {
  const engine = syncEngine();
  for (const m of putAwayMovements(lines)) {
    if (m.level) await engine.queue("stock_items", "update", { id: m.item_id, level: "ok" });
    await engine.queue("stock_movements", "insert", { id: crypto.randomUUID(), item_id: m.item_id, delta: m.delta, reason: "put_away", trip_id: o.tripId ?? null });
  }
  if (o.savePrices) {
    for (const l of lines) if (l.itemId && l.price && l.price > 0) await engine.queue("stock_items", "update", { id: l.itemId, usual_price_kes: Math.round(l.price) });
  }

  let spent = 0;
  if (o.logSpend) {
    const entries = o.receipt ? (o.receipt.total > 0 ? [o.receipt] : []) : spendByShop(lines);
    for (const g of entries) {
      await engine.queue("money_entries", "insert", {
        id: crypto.randomUUID(),
        direction: "out",
        occurred_on: nairobiToday(),
        amount_kes: Math.round(g.total),
        method: null,
        spent_by: o.meId ?? null,
        shop_id: g.shopId,
        category_id: null,
        trip_id: o.tripId ?? null,
        note: g.note,
        voids_entry_id: null,
      });
      spent += Math.round(g.total);
    }
  }

  for (const id of o.extraIds ?? []) await engine.queue("shopping_extras", "delete", { id });
  if (o.tripId) await engine.queue("shopping_trips", "update", { id: o.tripId, finished_at: new Date().toISOString() });

  // The shopping run on the Jobs board (due today or earlier) is done.
  const jobs = (await localDB().rows("jobs").toArray()) as unknown as Job[];
  const runs = jobs.filter((j) => !j.done_at && !j.deleted_at && j.category === "shopping_errand" && j.requires_funds && (!j.planned_for || j.planned_for <= nairobiToday()));
  for (const j of runs) await engine.queue("jobs", "update", { id: j.id, done_at: new Date().toISOString(), done_by: o.meId ?? null });

  return { spent, runsDone: runs.length };
}
