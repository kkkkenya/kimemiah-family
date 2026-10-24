// The Shop as the family really shops: by place (supermarket, market, kiosk, vet), with each
// thing bought as how many × unit price, checked against what was actually paid (an M-Pesa
// message, or cash). Pure, so it's tested.
import type { Shop } from "./shops";

// ---------------------------------------------------------------- places

export type PlaceId = "supermarket" | "market" | "kiosk" | "pets" | "other" | "anywhere";

export const PLACES: { id: PlaceId; label: string; hint: string }[] = [
  { id: "supermarket", label: "Supermarket", hint: "Naivas, Quickmart" },
  { id: "market", label: "Market & mama mboga", hint: "Prices you agree on the spot" },
  { id: "kiosk", label: "Kiosk", hint: "Bread, milk, airtime" },
  { id: "pets", label: "Vet & Kenchic", hint: "Dog food, meat, medicine" },
  { id: "other", label: "Other places", hint: "Gas, water, everything else" },
  { id: "anywhere", label: "Anywhere", hint: "Wherever it's found first" },
];

export function placeOf(shop: Pick<Shop, "name" | "kind"> | undefined | null): PlaceId {
  if (!shop) return "anywhere";
  if (shop.kind === "supermarket") return "supermarket";
  if (shop.kind === "market" || shop.kind === "mama_mboga" || shop.kind === "wholesaler") return "market";
  if (shop.name === "Kiosk") return "kiosk";
  if (shop.name === "Vet" || shop.name === "Kenchic") return "pets";
  return "other";
}

/** Which kind of spending a shop at a place counts as. */
export function kindNameFor(place: PlaceId): string {
  return place === "market" ? "Market and fresh" : place === "pets" ? "Dog" : place === "other" ? "Other" : "Food";
}

// ---------------------------------------------------------------- icons

export type IconId = "produce" | "meat" | "dairy" | "bakery" | "grains" | "oil" | "spices" | "cleaning" | "toiletries" | "pet" | "drinks" | "household" | "gas" | "water" | "other";

const WORDS: [IconId, RegExp][] = [
  ["pet", /\b(dog|puppy|pestigon|dewormer|vet)\b/i],
  ["meat", /\b(meat|beef|mince|chicken|kuku|fish|omena|liver|matumbo|sausage|eggs?)\b/i],
  ["dairy", /\b(milk|maziwa|yoghurt|yogurt|mala|cheese|butter|blue band|margarine)\b/i],
  ["bakery", /\b(bread|mkate|buns?|chapati|mandazi|cake)\b/i],
  ["produce", /\b(tomato\w*|onion\w*|sukuma|kale|spinach|cabbage|dhania|carrot\w*|potato\w*|waru|banana\w*|fruit|avocado\w*|mango\w*|garlic|ginger|pepper|hoho|managu|terere|veg\w*|lemon\w*|orange\w*)\b/i],
  ["grains", /\b(unga|flour|maize|rice|beans|ndengu|lentils|githeri|pasta|spaghetti|oats|porridge|uji|sugar|salt)\b/i],
  ["oil", /\b(oil|fat|kimbo|cowboy)\b/i],
  ["spices", /\b(royco|spice\w*|masala|curry|cubes?|tea leaves|chai|coffee)\b/i],
  ["drinks", /\b(soda|juice|water bottle|drink\w*|beer|wine)\b/i],
  ["toiletries", /\b(soap|toothpaste|toothbrush|tissue|toilet paper|lotion|vaseline|sanitary|pads|shampoo|deodorant)\b/i],
  ["cleaning", /\b(jik|bleach|omo|detergent|washing powder|dish\w*|vim|steel wool|sponge|broom|mop|harpic)\b/i],
  ["gas", /\b(gas|cylinder|charcoal|makaa)\b/i],
  ["water", /\b(water)\b/i],
  ["household", /\b(bulb|batter\w*|matches|candle\w*|foil|bags?|cable|hanger\w*)\b/i],
];
const BY_CATEGORY: Record<string, IconId> = {
  fresh_produce: "produce",
  cleaning: "cleaning",
  bathroom: "toiletries",
  pets: "pet",
  kitchen_staples: "grains",
  drinks_alcohol: "drinks",
  drinks_breakfast: "drinks",
  utilities: "household",
  home_upgrades: "household",
  tools: "household",
};

/** The icon for a thing on the list: from its name first, then its stock category. */
export function iconFor(title: string, category?: string | null): IconId {
  for (const [id, re] of WORDS) if (re.test(title)) return id;
  return (category && BY_CATEGORY[category]) || "other";
}

// ---------------------------------------------------------------- amounts

export const UNITS = ["piece", "kg", "g", "bunch", "litre", "packet", "tray", "heap", "bag", "bottle", "tin"] as const;

/** "3 bunches", "2 kg", "1 piece". */
export function unitLabel(u: string | null | undefined, n: number): string {
  const unit = u ?? "piece";
  if (unit === "kg" || unit === "g" || n === 1) return unit;
  return unit === "bunch" ? "bunches" : `${unit}s`;
}

/** A line's total from how many × unit price (rounded to the shilling). */
export const lineTotal = (qty: number, unitPrice: number) => Math.round(Math.max(0, qty) * Math.max(0, unitPrice));
/** A unit price from what was paid for how many (2 decimals, e.g. 3 bunches for 50 = 16.67). */
export const unitPrice = (total: number, qty: number) => (qty > 0 ? Math.round((total / qty) * 100) / 100 : 0);

export type BasketLine = { id: string; title: string; qty: number; unit: string; unit_price_kes: number; total_kes: number };

export type PaymentCheck = { state: "match" | "less" | "more"; basket: number; paid: number; diff: number };

/** Does what was paid match the basket? Less usually means bargaining; more, something missed. */
export function checkPayment(lines: Pick<BasketLine, "total_kes">[], paid: number): PaymentCheck {
  const basket = Math.round(lines.reduce((s, l) => s + Number(l.total_kes || 0), 0));
  const diff = Math.round(paid) - basket;
  return { state: diff === 0 ? "match" : diff < 0 ? "less" : "more", basket, paid: Math.round(paid), diff: Math.abs(diff) };
}

/**
 * Bargained down: share what was paid across the lines in proportion, in whole shillings, so the
 * lines add up exactly to it (rounding shared fairly). Unit prices follow.
 */
export function spreadToPaid<T extends BasketLine>(lines: T[], paid: number): T[] {
  const basket = lines.reduce((s, l) => s + l.total_kes, 0);
  if (!lines.length || basket <= 0) return lines;
  // Whole shillings, with the leftover shillings going to the lines that lost most to rounding.
  const exact = lines.map((l) => (l.total_kes / basket) * paid);
  const out = lines.map((l, i) => ({ ...l, total_kes: Math.floor(exact[i]) }));
  let rest = Math.round(paid) - out.reduce((s, l) => s + l.total_kes, 0);
  const byFraction = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of byFraction) {
    if (rest <= 0) break;
    out[i].total_kes += 1;
    rest -= 1;
  }
  return out.map((l) => ({ ...l, unit_price_kes: unitPrice(l.total_kes, l.qty) }));
}

// ---------------------------------------------------------------- price book

export type PricedLine = { title: string; item_id?: string | null; unit?: string | null; unit_price_kes?: number | null; qty_bought?: number | null; created_at?: string; deleted_at?: string | null };
export type PriceNote = { last: number; unit: string; low: number; high: number; times: number; when?: string };

const key = (l: { title: string; item_id?: string | null }) => l.item_id ?? l.title.trim().toLowerCase();

/** What the house has paid per unit for each thing, newest last-price first. */
export function priceBook(lines: PricedLine[]): Map<string, PriceNote> {
  const book = new Map<string, PriceNote>();
  const sorted = [...lines].filter((l) => !l.deleted_at && Number(l.unit_price_kes) > 0).sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  for (const l of sorted) {
    const p = Number(l.unit_price_kes);
    const k = key(l);
    const was = book.get(k);
    const sameUnit = !was || was.unit === (l.unit ?? "piece");
    book.set(k, {
      last: p,
      unit: l.unit ?? "piece",
      low: was && sameUnit ? Math.min(was.low, p) : p,
      high: was && sameUnit ? Math.max(was.high, p) : p,
      times: (sameUnit ? (was?.times ?? 0) : 0) + 1,
      when: l.created_at,
    });
  }
  return book;
}

export const priceFor = (book: Map<string, PriceNote>, thing: { title: string; item_id?: string | null }) => book.get(key(thing)) ?? (thing.item_id ? book.get(thing.title.trim().toLowerCase()) : undefined);

/** "Shop this again": the lines of a past shop that aren't already on the list. */
export function shopAgain<T extends { title: string; item_id?: string | null }>(lines: T[], onList: { title: string; item_id?: string | null }[]): T[] {
  const has = (l: T) => onList.some((o) => (l.item_id && o.item_id === l.item_id) || o.title.trim().toLowerCase() === l.title.trim().toLowerCase());
  const seen = new Set<string>();
  return lines.filter((l) => {
    const k = key(l);
    if (seen.has(k) || has(l)) return false;
    seen.add(k);
    return true;
  });
}

// ---------------------------------------------------------------- trips

export type Trip = { id: string; shop_id: string | null; member_id: string | null; started_at: string; finished_at: string | null; paid_kes?: number | null; method?: string | null; mpesa_code?: string | null; paid_from?: string | null; discount_kes?: number | null; deleted_at?: string | null; updated_at?: string };

const ACTIVE_MS = 8 * 60 * 60 * 1000;
/** Someone is out shopping: started in the last 8 hours and not finished. */
export const isActive = (t: Trip, now = Date.now()) => !t.deleted_at && !t.finished_at && now - Date.parse(t.started_at) < ACTIVE_MS;

export type TripLine = { id: string; trip_id: string; item_id: string | null; extra_id: string | null; title: string | null; qty_bought: number | null; unit: string | null; unit_price_kes: number | null; total_kes: number | null; icon: string | null; created_at?: string; deleted_at?: string | null };

/** An M-Pesa message shared into the app (Share → Kimemiah) waits here for the pay sheet. */
export const SHARED_SMS = "kimemiah-shared-sms";
