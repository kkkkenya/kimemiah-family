import type { Row } from "@/lib/sync/tables";

export type Shop = Row & { name: string; kind: string; sort: number };
export type StockItem = Row & {
  name: string;
  category: string;
  unit: string;
  shop_id: string | null;
  sort: number;
  shopping_tier?: "essential" | "standard" | "qol";
  is_fast_mover?: boolean;
  canonical_group_key?: string | null;
  canonical_concept?: string | null;
  preferred_brand?: string | null;
  brand_flexibility?: "any_cheapest" | "prefer_named" | "strict_named";
  usual_price_kes?: number | null;
  track_mode?: "count" | "level";
  level?: "ok" | "low" | "out";
  have_qty?: number;
  min_qty?: number;
  actor_id?: string | null;
  last_out_at?: string | null;
  early_depletion_streak?: number;
};
export type ShoppingItem = Row & {
  title: string;
  qty: string | null;
  quantity?: number; // how many, from the catalog stepper
  shop_id: string | null;
  item_id: string | null;
  bought_at: string | null;
  shopping_tier?: "essential" | "standard" | "qol";
  catalog_product_id?: string | null;
  preferred_store?: string | null;
  created_at?: string;
  actor_id?: string | null;
  _local?: boolean;
  auto?: boolean; // a Low / Out stock item shown on the list, not a saved row
};

// Supermarkets first, market separate: they're different trips. No kiosk (prices run 20-40% higher).
const ORDER = ["Naivas", "Quickmart", "Supermarket (either)", "Market", "Mama mboga", "Wholesaler", "Vet", "Kenchic", "Gas dealer", "Water vendor", "M-Pesa", "Other"];
export const SUPERMARKETS = new Set(["Naivas", "Quickmart", "Supermarket (either)"]);

export function sortShops(shops: Shop[]): Shop[] {
  const rank = (s: Shop) => {
    const i = ORDER.indexOf(s.name);
    return i === -1 ? ORDER.length + s.sort : i;
  };
  return [...shops].sort((a, b) => rank(a) - rank(b));
}

export const SHOP_HINT: Record<string, string> = {
  "Supermarket (either)": "Flour, oil, sugar, milk, bread, soap, tissue",
  Market: "Fresh produce, beans, charcoal",
  "Mama mboga": "Sukuma, dhania",
  "Gas dealer": "Gas refill",
  "Water vendor": "Drinking water",
  "M-Pesa": "Bills paid by M-Pesa",
};
