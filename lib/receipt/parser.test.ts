import { describe, expect, it } from "vitest";
import { matchItem, parseReceipt, receiptPerPack, type HouseItem } from "./parser";

// Lines from a real Naivas receipt (Kahawa Sukari, 21 Oct 2026).
const NAIVAS = `NAIVAS LIMITED
START OF FISCAL RECEIPT
STORE : KAHAWA SUKARI REGISTER No. 97-01
ITEM QTY PRICE AMOUNT
13505786 (1pcs)
1 x 117.00
FRESH WHITE BREAD 800GM 117.00 B
N000467 (1pcs)
1 x 320.00
DETTOL EVENTONE POMEGRANATE
SOAP 165G 320.00 B
DISCOUNT
71
12501396 (1pcs)
1 x 280.00
GEISHA COCONUT & HONEY SOAP 280.00 B
4*125G VALUE PACK
2035130000000 (0.100189kg)
0.100189 x 529
GARLIC IMPORTED P/KG 53.00 C
18500059 (1pcs)
1 x 295.00
FARMNAIVAS SUGAR PACKED 2KG 295.00 C
DISCOUNT
6
11500224 (2pcs)
2 x 162.00
SOKO MAIZE MEAL 2KG 324.00 B
10500177 (1pcs)
1 x 1,060.00
FRESH FRI COOKING OIL 3LTR 1,060.00 B
DISCOUNT
161
2035049000000 (1pcs)
1 x 20.00
DHANIA BUNCH 20.00 C
TOTAL LINES: 45
TOTAL BEFORE DISCOUNT 9,162.00
DISCOUNT AWARDED : 612.00
SUBTOTAL 7,688.34
VAT 861.66
TOTAL 8,550.00`;

describe("parseReceipt", () => {
  const r = parseReceipt(NAIVAS);

  it("finds the store and the total paid", () => {
    expect(r.store).toBe("naivas");
    expect(r.total).toBe(8550);
  });

  it("reads each line with its quantity, price and discount", () => {
    expect(r.lines.map((l) => [l.name, l.qty, l.unitPrice, l.total])).toEqual([
      ["FRESH WHITE BREAD 800GM", 1, 117, 117],
      ["DETTOL EVENTONE POMEGRANATE SOAP 165G", 1, 320, 249], // name wrapped; KES 71 off
      ["GEISHA COCONUT & HONEY SOAP 4*125G VALUE PACK", 1, 280, 280],
      ["GARLIC IMPORTED P/KG", 0.100189, 529, 53],
      ["FARMNAIVAS SUGAR PACKED 2KG", 1, 295, 289],
      ["SOKO MAIZE MEAL 2KG", 2, 162, 324],
      ["FRESH FRI COOKING OIL 3LTR", 1, 1060, 899],
      ["DHANIA BUNCH", 1, 20, 20],
    ]);
  });

  it("reads quantity on the same line, and pasted lists", () => {
    const q = parseReceipt("QUICKMART LIMITED\nSOKO MAIZE FLOUR 2KG 2 x 149.00 298.00\nTOTAL 298.00");
    expect(q.store).toBe("quickmart");
    expect(q.lines).toEqual([{ name: "SOKO MAIZE FLOUR 2KG", qty: 2, unitPrice: 149, total: 298 }]);
  });
});

describe("matching to house items", () => {
  const items: HouseItem[] = [
    { id: "unga", name: "Maize flour (unga)", unit: "2 kg packet", canonical_concept: "maize-flour" },
    { id: "oil", name: "Cooking oil", unit: "litre", canonical_concept: "cooking-oil" },
    { id: "sugar", name: "Sugar", unit: "kg", canonical_concept: "sugar" },
    { id: "soap", name: "Bathing soap", unit: "bar", canonical_concept: "bathing-soap" },
    { id: "dhania", name: "Dhania", unit: "bunch", track_mode: "level" },
    { id: "sukuma", name: "Sukuma wiki", unit: "bunch", track_mode: "level" },
    { id: "panga", name: "Panga", track_mode: "tool" },
  ];

  it("matches by product family, then by name", () => {
    expect(matchItem("SOKO MAIZE MEAL 2KG", items)?.id).toBe("unga");
    expect(matchItem("FRESH FRI COOKING OIL 3LTR", items)?.id).toBe("oil");
    expect(matchItem("GEISHA COCONUT & HONEY SOAP 4*125G VALUE PACK", items)?.id).toBe("soap");
    expect(matchItem("DHANIA BUNCH", items)?.id).toBe("dhania");
    expect(matchItem("SUKUMAWIKI BUNCH", items)?.id).toBe("sukuma");
    expect(matchItem("KIWI BLACK SHOE POLISH 25ML", items)).toBeNull();
  });

  it("converts packs to the house unit", () => {
    expect(receiptPerPack("FRESH FRI COOKING OIL 3LTR", items[1])).toBe(3);
    expect(receiptPerPack("FARMNAIVAS SUGAR PACKED 2KG", items[2])).toBe(2);
    expect(receiptPerPack("SOKO MAIZE MEAL 2KG", items[0])).toBe(1);
    expect(receiptPerPack("GEISHA COCONUT & HONEY SOAP 4*125G VALUE PACK", items[3])).toBe(1); // "4*125G" isn't read as 4 bars
  });
});
