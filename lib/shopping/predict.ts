// "Likely running low?": how long an item usually lasts between restocks, from the dates it was
// put away, and upgrade items in the cart that are on sale this week.

import type { CatalogMatch } from "./pricing";
import type { Movement } from "./stock";

const DAY = 86400_000;

/** Days between the item's last restocks (the last 3 gaps); null until it has been put away 3 times. */
export function usualDays(itemId: string, movements: Movement[]): number | null {
  const times = movements
    .filter((m) => m.item_id === itemId && m.reason === "put_away" && !m.deleted_at && m.created_at)
    .map((m) => Date.parse(m.created_at!))
    .sort((a, b) => a - b);
  // Put-aways on the same day (several packs, or one trip logged twice) count once.
  const days = times.filter((t, i) => i === 0 || t - times[i - 1] > DAY / 2);
  if (days.length < 3) return null;
  const gaps = days.slice(1).map((t, i) => (t - days[i]) / DAY).slice(-3);
  return gaps.reduce((s, g) => s + g, 0) / gaps.length;
}

/**
 * True when an item still marked OK has used 80% of its usual time since the last restock,
 * unless someone said "Still OK" in the last 3 days.
 */
export function likelyLow(itemId: string, movements: Movement[], now = Date.now(), stillOkAt?: number): boolean {
  const usual = usualDays(itemId, movements);
  if (!usual) return false;
  if (stillOkAt && now - stillOkAt < 3 * DAY) return false;
  const last = Math.max(
    ...movements.filter((m) => m.item_id === itemId && m.reason === "put_away" && !m.deleted_at && m.created_at).map((m) => Date.parse(m.created_at!)),
  );
  return (now - last) / DAY >= 0.8 * usual;
}

export type CartLine = { id: string; title: string; shopping_tier?: string; catalog_product_id?: string | null; concept?: string | null; bought_at?: string | null };

/** Can-wait upgrades in the cart with a 12%+ deal this week, on the exact product or the same kind of product. */
export function upgradeDeals(cart: CartLine[], products: CatalogMatch[]): { line: CartLine; deal: CatalogMatch }[] {
  const out: { line: CartLine; deal: CatalogMatch }[] = [];
  for (const line of cart) {
    if (line.shopping_tier !== "qol" || line.bought_at) continue;
    const exact = products.find((p) => p.id === line.catalog_product_id);
    const concept = exact?.canonical_concept ?? line.concept;
    const deal = products
      .filter((p) => p.is_on_sale && Number(p.discount_pct) >= 12 && (p.id === line.catalog_product_id || (concept && p.canonical_concept === concept)))
      .sort((a, b) => Number(b.discount_pct) - Number(a.discount_pct))[0];
    if (deal) out.push({ line, deal });
  }
  return out;
}
