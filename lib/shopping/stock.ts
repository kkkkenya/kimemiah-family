// Stock logic: counts, the automatic shopping list, "Put away" and the "ran out early" note.
// Pure functions over this phone's copy, so they work with no signal.

import { isCounted, stockStatus, type CatalogMatch, type StockLike } from "./pricing";

export type Movement = {
  id: string;
  item_id: string;
  delta: number;
  reason?: string | null;
  created_at?: string;
  actor_id?: string | null;
  deleted_at?: string | null;
};

const num = (n: unknown) => Number(n ?? 0);
const later = (a?: string, b?: string) => (!a ? b : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b);

/**
 * have_qty as the server counts it (the sum of the item's movements), including this
 * phone's changes that haven't synced yet. An item someone has moved counts as checked.
 */
export function withLocalCounts<T extends StockLike>(stock: T[], movements: Movement[], meId?: string): T[] {
  const byItem = new Map<string, Movement[]>();
  for (const m of movements) {
    if (m.deleted_at) continue;
    const list = byItem.get(m.item_id);
    if (list) list.push(m);
    else byItem.set(m.item_id, [m]);
  }
  return stock.map((s) => {
    const moves = byItem.get(s.id);
    if (!moves) return s;
    const last = moves.reduce((a, b) => ((b.created_at ?? "") > (a.created_at ?? "") ? b : a));
    return {
      ...s,
      have_qty: moves.reduce((sum, m) => sum + num(m.delta), 0),
      updated_at: later(s.updated_at, last.created_at),
      actor_id: s.actor_id ?? last.actor_id ?? meId ?? null,
    };
  });
}

/** Low or Out, and someone has actually checked it (starter rows nobody counted don't count). */
export const needsRestock = (s: StockLike) => !s.deleted_at && isCounted(s) && stockStatus(s) !== "ok";

export type ListEntry = { item_id?: string | null; title: string; deleted_at?: string | null };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Low / Out items that join the shopping list on their own: any not already there
 * (to buy or in the basket), linked by item_id or, for hand-typed rows, by name.
 */
export function autoListItems<T extends StockLike>(stock: T[], list: ListEntry[]): T[] {
  const live = list.filter((e) => !e.deleted_at);
  return stock.filter((s) => needsRestock(s) && !live.some((e) => e.item_id === s.id || same(e.title, s.name)));
}

/** "Ran out early last 2 runs": bulk items only; fast movers are meant to run out between runs. */
export const ranOutEarly = (s: StockLike & { early_depletion_streak?: number }) =>
  !s.deleted_at && !s.is_fast_mover && num(s.early_depletion_streak) >= 2;

// ---------------------------------------------------------------- put away

/** The number at the start of "2", "2 packets" or "1.5 kg". */
export function parseQty(text: string | null | undefined): number | null {
  const m = text?.trim().match(/^(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return n > 0 ? n : null;
}

// House units counted one by one: a 10-pack of tissue is 10 rolls, Geisha 4x125g is 4 bars.
// Other count units ("tray", "pack", "set") are the pack itself: 30 eggs are 1 tray.
const SINGLE = /^(roll|bar|piece|tube|sachet|cube|box|bottle|can)s?$/i;
const WEIGHT: Record<string, number> = { kg: 1, g: 0.001 };
const VOLUME: Record<string, number> = { l: 1, litre: 1, liter: 1, ml: 0.001 };

/** A house unit as an amount: "litre" is 1 L, "2 kg packet" is 2 kg, "500 ml" is 0.5 L, "roll" is one item. */
function houseUnit(unit: string): { qty: number; base: "kg" | "liter" } | { single: boolean } {
  const m = unit.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)?\s*(kg|g|litre|liter|l|ml)(?![a-z])/);
  if (m) {
    const n = Number(m[1] ?? 1);
    return m[2] in WEIGHT ? { qty: n * WEIGHT[m[2]], base: "kg" } : { qty: n * VOLUME[m[2]], base: "liter" };
  }
  return { single: SINGLE.test(unit.trim()) };
}

/**
 * How many of the house unit one catalog pack adds: Fresh Fri 3L is 3 litres, a 10-pack of
 * toilet tissue is 10 rolls, a 2 kg sugar packet is 2 kg. 1 when the two can't be compared.
 */
export function unitsPerPack(product: Pick<CatalogMatch, "normalized_qty" | "normalized_unit" | "pack_size_label"> | undefined, unit: string | undefined): number {
  if (!product || !unit) return 1;
  const house = houseUnit(unit);
  const qty = Number(product.normalized_qty ?? 0);
  if ("base" in house) {
    if (!qty || product.normalized_unit !== house.base) return 1;
    return Math.round((qty / house.qty) * 100) / 100 || 1;
  }
  if (!house.single) return 1;
  if (product.normalized_unit === "unit" && qty >= 1) return qty;
  const multi = product.pack_size_label?.match(/^(\d+)\s*X/i);
  return multi ? Number(multi[1]) : 1;
}

export type PutAwayLine = {
  extraId: string;
  itemId: string | null;
  title: string;
  shopId: string | null;
  level: boolean; // OK / Low / Out item: goes back to OK, no count
  qty: number; // packs bought
  perPack?: number; // house units in one pack (3 for a 3 L bottle counted in litres); 1 if missing
  price: number | null; // per pack, KES
};

/** House units a line adds to stock: packs bought times what one pack holds. */
export const unitsAdded = (l: PutAwayLine) => Math.round(l.qty * (l.perPack ?? 1) * 100) / 100;

/** Stock changes for a put away: counted items go up by what was bought; level items get a 0 marker for history and the early-run check. */
export function putAwayMovements(lines: PutAwayLine[]): { item_id: string; delta: number; level: boolean }[] {
  return lines
    .filter((l) => l.itemId && (l.level || l.qty > 0))
    .map((l) => ({ item_id: l.itemId!, delta: l.level ? 0 : unitsAdded(l), level: l.level }));
}

export const lineTotal = (l: PutAwayLine) => (l.price ?? 0) * (l.level ? 1 : l.qty);

/** One spend entry per shop: the total of priced lines and a short note of what was bought. */
export function spendByShop(lines: PutAwayLine[]): { shopId: string | null; total: number; note: string }[] {
  const groups = new Map<string | null, PutAwayLine[]>();
  for (const l of lines) groups.set(l.shopId, [...(groups.get(l.shopId) ?? []), l]);
  return [...groups]
    .map(([shopId, ls]) => ({
      shopId,
      total: Math.round(ls.reduce((sum, l) => sum + lineTotal(l), 0)),
      note: ls.map((l) => (!l.level && l.qty !== 1 ? `${l.title} ×${l.qty}` : l.title)).join(", "),
    }))
    .filter((g) => g.total > 0);
}

// ---------------------------------------------------------------- history

export type LevelChange = { at: string; actor_id: string | null; from: string | null; to: string };
export type HistoryEntry = { at: string; actor_id: string | null; text: string };

const LEVEL_WORD: Record<string, string> = { ok: "OK", low: "Low", out: "Out" };

/** A short, newest-first history of who changed an item: counts from movements, OK / Low / Out from the log. */
export function itemHistory(itemId: string, movements: Movement[], levels: LevelChange[], limit = 8): HistoryEntry[] {
  const fromMoves = movements
    .filter((m) => m.item_id === itemId && !m.deleted_at && (num(m.delta) !== 0 || m.reason === "put_away"))
    .map((m) => {
      const d = num(m.delta);
      const signed = d > 0 ? `+${d}` : `−${Math.abs(d)}`;
      return {
        at: m.created_at ?? "",
        actor_id: m.actor_id ?? null,
        text: m.reason === "put_away" ? (d ? `Put away ${signed}` : "Put away") : signed,
      };
    });
  const fromLevels = levels
    .filter((l) => l.from !== null && l.from !== l.to) // null: the row being created, not a change
    .map((l) => ({ at: l.at, actor_id: l.actor_id, text: `Marked ${LEVEL_WORD[l.to] ?? l.to}` }));
  return [...fromMoves, ...fromLevels].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
