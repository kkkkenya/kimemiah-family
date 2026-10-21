import { describe, expect, it } from "vitest";
import type { StockLike } from "./pricing";
import {
  autoListItems,
  itemHistory,
  parseQty,
  putAwayMovements,
  ranOutEarly,
  unitsPerPack,
  spendByShop,
  withLocalCounts,
  type Movement,
  type PutAwayLine,
} from "./stock";

const item = (o: Partial<StockLike> & { id: string }): StockLike => ({
  name: o.id,
  track_mode: "count",
  have_qty: 0,
  min_qty: 1,
  actor_id: "mom",
  ...o,
});
const mv = (o: Partial<Movement> & { item_id: string; delta: number }): Movement => ({ id: crypto.randomUUID(), ...o });

describe("withLocalCounts", () => {
  it("sums movements from two phones, synced or not", () => {
    const oil = item({ id: "oil", have_qty: 3 });
    const moves = [mv({ item_id: "oil", delta: 3 }), mv({ item_id: "oil", delta: -1 }), mv({ item_id: "oil", delta: -1 })];
    expect(withLocalCounts([oil], moves)[0].have_qty).toBe(1);
  });

  it("ignores removed movements and leaves items without movements alone", () => {
    const oil = item({ id: "oil" });
    const salt = item({ id: "salt", have_qty: 2 });
    const [o, s] = withLocalCounts([oil, salt], [mv({ item_id: "oil", delta: 2 }), mv({ item_id: "oil", delta: -2, deleted_at: "x" })]);
    expect(o.have_qty).toBe(2);
    expect(s).toBe(salt);
  });

  it("an item this phone just counted counts as checked", () => {
    const sugar = item({ id: "sugar", actor_id: null, updated_at: "2026-10-01T00:00:00Z" });
    const [s] = withLocalCounts([sugar], [mv({ item_id: "sugar", delta: 2, created_at: "2026-10-21T08:00:00Z" })], "me");
    expect(s.actor_id).toBe("me");
    expect(s.updated_at).toBe("2026-10-21T08:00:00Z");
  });
});

describe("autoListItems", () => {
  const oil = item({ id: "oil", have_qty: 1, min_qty: 1 }); // low
  const salt = item({ id: "salt", have_qty: 3 }); // ok
  const tomatoes = item({ id: "tomatoes", track_mode: "level", level: "out" });
  const uncounted = item({ id: "unga", actor_id: null }); // starter row, 0 but never checked

  it("adds Low and Out items that were checked", () => {
    expect(autoListItems([oil, salt, tomatoes, uncounted], []).map((s) => s.id)).toEqual(["oil", "tomatoes"]);
  });

  it("never duplicates an item already on the list or in the basket", () => {
    const list = [
      { item_id: "oil", title: "Cooking oil" },
      { item_id: null, title: " TOMATOES " },
    ];
    expect(autoListItems([oil, tomatoes], list)).toEqual([]);
  });

  it("brings an item back once its list row is removed", () => {
    expect(autoListItems([oil], [{ item_id: "oil", title: "oil", deleted_at: "x" }]).map((s) => s.id)).toEqual(["oil"]);
  });
});

describe("ranOutEarly", () => {
  it("shows for a bulk item that ran out early two runs in a row", () => {
    expect(ranOutEarly({ ...item({ id: "rice" }), early_depletion_streak: 2 })).toBe(true);
    expect(ranOutEarly({ ...item({ id: "rice" }), early_depletion_streak: 1 })).toBe(false);
  });
  it("never shows for fast movers", () => {
    expect(ranOutEarly({ ...item({ id: "milk", is_fast_mover: true }), early_depletion_streak: 3 })).toBe(false);
  });
});

describe("put away", () => {
  it("reads the number at the start of a quantity", () => {
    expect(parseQty("2")).toBe(2);
    expect(parseQty("3 packets")).toBe(3);
    expect(parseQty("1,5 kg")).toBe(1.5);
    expect(parseQty("a few")).toBeNull();
    expect(parseQty(null)).toBeNull();
  });

  const line = (o: Partial<PutAwayLine>): PutAwayLine => ({
    extraId: crypto.randomUUID(),
    itemId: null,
    title: "x",
    shopId: "naivas",
    level: false,
    qty: 1,
    price: null,
    ...o,
  });

  it("adds bought counts to stock and marks OK / Low / Out items", () => {
    const lines = [
      line({ itemId: "oil", qty: 2 }),
      line({ itemId: "sukuma", level: true }),
      line({ itemId: null, title: "Birthday cake" }),
      line({ itemId: "salt", qty: 0 }),
    ];
    expect(putAwayMovements(lines)).toEqual([
      { item_id: "oil", delta: 2, level: false },
      { item_id: "sukuma", delta: 0, level: true },
    ]);
  });

  it("counts packs in the house unit", () => {
    const pack = (normalized_qty: number, normalized_unit: "kg" | "liter" | "unit", pack_size_label: string) => ({ normalized_qty, normalized_unit, pack_size_label });
    // Lines from a real Naivas receipt (21 Oct 2026) against the starter stock units.
    expect(unitsPerPack(pack(3, "liter", "3L"), "litre")).toBe(3); // Fresh Fri 3L
    expect(unitsPerPack(pack(10, "unit", "10PK"), "roll")).toBe(10); // toilet tissue 10-pack
    expect(unitsPerPack(pack(0.5, "kg", "4X125G"), "bar")).toBe(4); // Geisha 4x125g
    expect(unitsPerPack(pack(4, "unit", "4PK"), "piece")).toBe(4); // Supa Brite 4pk
    expect(unitsPerPack(pack(2, "kg", "2KG"), "kg")).toBe(2); // sugar 2kg
    expect(unitsPerPack(pack(2, "kg", "2KG"), "2 kg packet")).toBe(1); // Soko maize meal 2kg
    expect(unitsPerPack(pack(1, "kg", "1KG"), "500 g packet")).toBe(2); // salt 1kg
    expect(unitsPerPack(pack(0.5, "liter", "500ML"), "litre")).toBe(0.5);
    expect(unitsPerPack(pack(0.75, "liter", "750ML"), "750 ml")).toBe(1); // bleach
    expect(unitsPerPack(pack(0.12, "liter", "120ML"), "tube")).toBe(1); // toothpaste
    expect(unitsPerPack(pack(30, "unit", "30PK"), "tray")).toBe(1); // 30 eggs are one tray
    expect(unitsPerPack(pack(0.4, "kg", "400G"), "500 ml")).toBe(1); // dish paste vs liquid: can't compare
    expect(unitsPerPack(undefined, "litre")).toBe(1); // not from the catalog
  });

  it("adds packs times what each holds", () => {
    expect(putAwayMovements([line({ itemId: "oil", qty: 2, perPack: 3 })])).toEqual([{ item_id: "oil", delta: 6, level: false }]);
  });

  it("makes one spend entry per shop from the prices", () => {
    const lines = [
      line({ title: "Oil", qty: 2, price: 545 }),
      line({ title: "Salt", price: 40 }),
      line({ title: "Sukuma", shopId: "mama", level: true, qty: 3, price: 50 }),
      line({ title: "Mystery", shopId: "market", price: null }),
    ];
    expect(spendByShop(lines)).toEqual([
      { shopId: "naivas", total: 1130, note: "Oil ×2, Salt" },
      { shopId: "mama", total: 50, note: "Sukuma" },
    ]);
  });
});

describe("itemHistory", () => {
  it("merges counts and OK / Low / Out changes, newest first", () => {
    const moves = [
      mv({ item_id: "oil", delta: -1, created_at: "2026-10-20T10:00:00Z", actor_id: "a" }),
      mv({ item_id: "oil", delta: 2, reason: "put_away", created_at: "2026-10-21T10:00:00Z", actor_id: "b" }),
      mv({ item_id: "salt", delta: 1, created_at: "2026-10-21T11:00:00Z" }),
    ];
    const levels = [
      { at: "2026-10-01T10:00:00Z", actor_id: null, from: null, to: "ok" }, // starter row created
      { at: "2026-10-19T10:00:00Z", actor_id: "c", from: "ok", to: "low" },
      { at: "2026-10-19T11:00:00Z", actor_id: "c", from: "low", to: "low" }, // other field edited
    ];
    expect(itemHistory("oil", moves, levels).map((h) => h.text)).toEqual(["Put away +2", "−1", "Marked Low"]);
  });
});
