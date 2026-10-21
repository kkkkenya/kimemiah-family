import type { Row } from "@/lib/sync/tables";

export type Shop = Row & { name: string; kind: string; sort: number };
export type StockItem = Row & { name: string; category: string; unit: string; shop_id: string | null; sort: number };
export type ShoppingItem = Row & {
  title: string;
  qty: string | null;
  shop_id: string | null;
  item_id: string | null;
  bought_at: string | null;
  created_at?: string;
  actor_id?: string | null;
  _local?: boolean;
};

// Market and supermarket first and always separate: they're different trips.
const ORDER = ["Market", "Supermarket", "Mama mboga", "Kiosk", "Wholesaler", "Gas dealer", "Water vendor", "M-Pesa", "Other"];

export function sortShops(shops: Shop[]): Shop[] {
  const rank = (s: Shop) => {
    const i = ORDER.indexOf(s.name);
    return i === -1 ? ORDER.length + s.sort : i;
  };
  return [...shops].sort((a, b) => rank(a) - rank(b));
}

export const SHOP_HINT: Record<string, string> = {
  Market: "Fresh produce, beans, charcoal",
  Supermarket: "Flour, oil, soap, tissue",
  "Mama mboga": "Sukuma, dhania",
  Kiosk: "Milk, bread, matches",
  "Gas dealer": "Gas refill",
  "Water vendor": "Drinking water",
  "M-Pesa": "KPLC tokens",
};
