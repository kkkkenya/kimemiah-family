// Reads Kenyan supermarket till receipts (Naivas, Quickmart ETR layouts), from pasted text or
// from a photo run through OCR, and matches each line to a house item.
//
// Layouts handled:
//   13505786 (1pcs)                      <- code and count (ignored)
//   1 x 117.00                           <- quantity x unit price, for the next line
//   FRESH WHITE BREAD 800GM   117.00 B   <- name, line total, tax code
//   DISCOUNT / 71                        <- taken off the line above
//   SOKO MAIZE MEAL 2KG  2 x 162.00  324.00   (all on one line)

import { conceptFor, parseSize } from "@/scripts/lib/product-parser.mjs";
import { unitsPerPack } from "@/lib/shopping/stock";

export type ReceiptLine = { name: string; qty: number; unitPrice: number; total: number };
export type Receipt = { store: "naivas" | "quickmart" | null; lines: ReceiptLine[]; total: number | null };

const money = (s: string) => Number(s.replace(/,/g, ""));
const AMOUNT = /([\d,]+\.\d{2})/;
const NOT_ITEMS = /\b(sub ?total|total|vat|cash|change|m-?pesa|tender|balance|rounding|item\s+qty|receipt|pin|till|discount awarded|before discount|code|rate|vatable|payment|card)\b/i;

export function parseReceipt(text: string): Receipt {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  let store: Receipt["store"] = null;
  let total: number | null = null;
  const lines: ReceiptLine[] = [];
  let pending: { qty: number; unitPrice: number } | null = null;
  let namePart = ""; // first half of a name that wrapped before its price line
  let discountNext = false;
  let lastWasItem = false;

  for (const row of rows) {
    // The store, from the header (before any item: product names like "FarmNaivas" don't count).
    if (!lines.length && !store) {
      if (/naivas/i.test(row)) store = "naivas";
      else if (/quick ?mart/i.test(row)) store = "quickmart";
    }

    const grand = row.match(/^total\b(?!\s*(lines|before))[^\d]*([\d,]+\.\d{2})/i);
    if (grand) {
      total = money(grand[2]);
      lastWasItem = false;
      continue;
    }

    // "DISCOUNT 71" or "DISCOUNT" then "71" on the next line: comes off the item above.
    const disc = row.match(/^discount\b\s*([\d,]+(?:\.\d+)?)?$/i);
    if (disc) {
      if (disc[1] && lines.length) lines[lines.length - 1].total -= money(disc[1]);
      else discountNext = true;
      lastWasItem = false;
      continue;
    }
    if (discountNext && /^[\d,]+(\.\d+)?$/.test(row)) {
      if (lines.length) lines[lines.length - 1].total -= money(row);
      discountNext = false;
      continue;
    }

    // "1 x 117.00" or "0.100189 x 529": quantity and unit price for the item on the next line.
    const qp = row.match(/^(\d+(?:\.\d+)?)\s*[x×*]\s*([\d,]+(?:\.\d+)?)$/i);
    if (qp) {
      pending = { qty: Number(qp[1]), unitPrice: money(qp[2]) };
      lastWasItem = false;
      continue;
    }

    // Item code with a count, e.g. "13505786 (1pcs)": nothing to keep.
    if (/^[a-z]?\d{5,}\s*(\(.*\))?$/i.test(row)) {
      lastWasItem = false;
      continue;
    }

    const amount = row.match(new RegExp(`^(.*?[A-Za-z].*?)\\s+${AMOUNT.source}\\s*[A-Z]?$`));
    if (amount && !NOT_ITEMS.test(amount[1])) {
      let name = namePart ? `${namePart} ${amount[1]}` : amount[1];
      const lineTotal = money(amount[2]);
      let qty = pending?.qty ?? 1;
      let unitPrice = pending?.unitPrice ?? lineTotal / qty;
      // Quantity on the same line: "SOKO MAIZE MEAL 2KG 2 x 162.00"
      const inline = name.match(/^(.*?)\s+(\d+(?:\.\d+)?)\s*[x×@]\s*([\d,]+(?:\.\d+)?)$/i);
      if (inline) {
        name = inline[1];
        qty = Number(inline[2]);
        unitPrice = money(inline[3]);
      }
      lines.push({ name: name.trim(), qty, unitPrice, total: lineTotal });
      pending = null;
      namePart = "";
      lastWasItem = true;
      continue;
    }

    // A long name wrapped before its price ("DETTOL EVENTONE POMEGRANATE" / "SOAP 165G 320.00 B").
    if (pending && /[A-Za-z]/.test(row) && !NOT_ITEMS.test(row)) {
      namePart = namePart ? `${namePart} ${row}` : row;
      continue;
    }

    // ...or after it ("4*125G VALUE PACK").
    if (lastWasItem && /[A-Za-z]/.test(row) && !NOT_ITEMS.test(row) && lines.length) {
      lines[lines.length - 1].name += ` ${row}`;
      continue;
    }
    lastWasItem = false;
  }
  for (const l of lines) l.total = Math.round(l.total * 100) / 100;
  return { store, lines, total };
}

// ---------------------------------------------------------------- matching to house items

export type HouseItem = { id: string; name: string; unit?: string; canonical_concept?: string | null; track_mode?: string; deleted_at?: string | null };

const compact = (s: string) => s.toLowerCase().split("(")[0].replace(/[^a-z]/g, "");

/** The house item a receipt line is for: same product family first, then the item's name inside the line. */
export function matchItem(name: string, items: HouseItem[]): HouseItem | null {
  const live = items.filter((i) => !i.deleted_at && i.track_mode !== "tool");
  const concept = conceptFor(name);
  if (concept) {
    const byConcept = live.find((i) => i.canonical_concept === concept);
    if (byConcept) return byConcept;
  }
  const line = compact(name);
  const byName = live
    .map((i) => ({ i, key: compact(i.name) }))
    .filter(({ key }) => key.length >= 4 && line.includes(key))
    .sort((a, b) => b.key.length - a.key.length)[0];
  return byName?.i ?? null;
}

/** How many of the item's own unit one pack on the receipt adds (3 L oil = 3 litres). */
export function receiptPerPack(name: string, item: HouseItem): number {
  const size = parseSize(name);
  if (!size) return 1;
  return unitsPerPack({ normalized_qty: size.qty, normalized_unit: size.unit as "kg" | "liter" | "unit", pack_size_label: size.label.toUpperCase() }, item.unit);
}
