// Small pure helpers for Home: tonight's supper headcount and the essentials needed now.

import { needsRestock } from "@/lib/shopping/stock";
import { stockStatus, type StockLike } from "@/lib/shopping/pricing";

export const nairobiToday = (now = Date.now()) => new Date(now + 3 * 3600_000).toISOString().slice(0, 10);

export type Diner = { id: string; name: string; sort: number; active?: boolean; is_remote?: boolean; presence?: string | null; eating_out_on?: string | null };

/** Who's home for supper tonight: everyone living at home, not away, minus anyone who said they'd be out today. */
export function supperCount(people: Diner[], now = Date.now()) {
  const today = nairobiToday(now);
  const house = people.filter((p) => p.active !== false && !p.is_remote && p.presence !== "away").sort((a, b) => a.sort - b.sort);
  const out = house.filter((p) => p.eating_out_on === today);
  return { eating: house.length - out.length, total: house.length, out: out.map((p) => p.name), outIds: new Set(out.map((p) => p.id)) };
}

/** Essential items that are Out or Low (and checked), Out first. */
export function essentialsNeeded<T extends StockLike & { name: string }>(stock: T[]): T[] {
  return stock
    .filter((s) => s.shopping_tier === "essential" && s.track_mode !== ("tool" as never) && needsRestock(s))
    .sort((a, b) => Number(stockStatus(b) === "out") - Number(stockStatus(a) === "out") || a.name.localeCompare(b.name));
}
