import { describe, expect, it } from "vitest";
import { checkPayment, iconFor, kindNameFor, lineTotal, placeOf, priceBook, priceFor, shopAgain, spreadToPaid, unitPrice, type BasketLine } from "./market";

describe("places", () => {
  it("puts each shop in the place the family thinks of", () => {
    expect(placeOf({ name: "Naivas", kind: "supermarket" })).toBe("supermarket");
    expect(placeOf({ name: "Mama mboga", kind: "mama_mboga" })).toBe("market");
    expect(placeOf({ name: "Market", kind: "market" })).toBe("market");
    expect(placeOf({ name: "Kiosk", kind: "other" })).toBe("kiosk");
    expect(placeOf({ name: "Kenchic", kind: "other" })).toBe("pets");
    expect(placeOf({ name: "Gas dealer", kind: "other" })).toBe("other");
    expect(placeOf(null)).toBe("anywhere");
    expect(kindNameFor("market")).toBe("Market and fresh");
    expect(kindNameFor("pets")).toBe("Dog");
    expect(kindNameFor("supermarket")).toBe("Food");
  });
});

describe("icons", () => {
  it("knows the usual things by name, then by stock category", () => {
    expect(iconFor("Tomatoes")).toBe("produce");
    expect(iconFor("Sukuma wiki")).toBe("produce");
    expect(iconFor("Beef 1kg")).toBe("meat");
    expect(iconFor("Eggs tray")).toBe("meat");
    expect(iconFor("Maize flour (unga)")).toBe("grains");
    expect(iconFor("Dog unga")).toBe("pet");
    expect(iconFor("Jik")).toBe("cleaning");
    expect(iconFor("Toilet paper")).toBe("toiletries");
    expect(iconFor("Cooking gas")).toBe("gas");
    expect(iconFor("Something odd", "bathroom")).toBe("toiletries");
    expect(iconFor("Something odd")).toBe("other");
  });
});

describe("amounts and paying", () => {
  const lines: BasketLine[] = [
    { id: "a", title: "Tomatoes", qty: 2, unit: "kg", unit_price_kes: 80, total_kes: lineTotal(2, 80) },
    { id: "b", title: "Sukuma", qty: 3, unit: "bunch", unit_price_kes: 20, total_kes: 60 },
    { id: "c", title: "Onions", qty: 1, unit: "kg", unit_price_kes: 100, total_kes: 100 },
  ];
  it("works out totals and unit prices", () => {
    expect(lineTotal(2, 80)).toBe(160);
    expect(lineTotal(0.5, 90)).toBe(45);
    expect(unitPrice(50, 3)).toBe(16.67);
    expect(unitPrice(50, 0)).toBe(0);
  });
  it("checks what was paid against the basket", () => {
    expect(checkPayment(lines, 320)).toEqual({ state: "match", basket: 320, paid: 320, diff: 0 });
    expect(checkPayment(lines, 300)).toMatchObject({ state: "less", diff: 20 });
    expect(checkPayment(lines, 400)).toMatchObject({ state: "more", diff: 80 });
  });
  it("spreads a bargain across the lines so they add up exactly", () => {
    const s = spreadToPaid(lines, 300);
    expect(s.reduce((x, l) => x + l.total_kes, 0)).toBe(300);
    expect(s.find((l) => l.id === "a")!.total_kes).toBe(150);
    expect(s.find((l) => l.id === "a")!.unit_price_kes).toBe(75);
  });
});

describe("price book and shopping again", () => {
  const history = [
    { title: "Tomatoes", unit: "kg", unit_price_kes: 70, created_at: "2026-10-01" },
    { title: "Tomatoes", unit: "kg", unit_price_kes: 100, created_at: "2026-10-08" },
    { title: "tomatoes", unit: "kg", unit_price_kes: 80, created_at: "2026-10-15" },
    { title: "Sukuma", unit: "bunch", unit_price_kes: 20, created_at: "2026-10-15", deleted_at: "2026-10-16" },
  ];
  it("remembers the last price and the usual range per unit", () => {
    const book = priceBook(history);
    expect(priceFor(book, { title: "Tomatoes" })).toEqual({ last: 80, unit: "kg", low: 70, high: 100, times: 3, when: "2026-10-15" });
    expect(priceFor(book, { title: "Sukuma" })).toBeUndefined();
  });
  it("adds back only what isn't already on the list", () => {
    const again = shopAgain([{ title: "Tomatoes" }, { title: "Onions" }, { title: "onions" }, { title: "Milk", item_id: "milk" }], [{ title: "tomatoes" }, { title: "Fresh milk", item_id: "milk" }]);
    expect(again.map((l) => l.title)).toEqual(["Onions"]);
  });
});
