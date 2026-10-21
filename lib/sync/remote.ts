"use client";

import { supabase } from "@/lib/supabase/client";
import { NotUnlockedError, type ApplyResult, type Mutation, type Remote } from "./engine";
import type { Row, SyncTable } from "./tables";

// Text and numbers only (no images or links), so the whole catalog stays small on the phone.
const CATALOG_COLUMNS =
  "id, store, title, brand, category_group, canonical_group_key, canonical_concept, pack_size_label, normalized_qty, normalized_unit, regular_price, sale_price, effective_price, discount_pct, unit_price, is_on_sale, in_stock, default_tier, price_changed_at";

export const supabaseRemote: Remote = {
  async hasAccess() {
    const { data, error } = await supabase().rpc("is_household");
    if (error) throw error;
    return data === true;
  },

  async applyMutations(mutations: Mutation[]): Promise<ApplyResult> {
    const { data, error } = await supabase().rpc("apply_mutations", { mutations });
    if (error) {
      if (error.code === "42501") throw new NotUnlockedError();
      throw error;
    }
    return data as ApplyResult;
  },

  async pull(table: SyncTable, since: string | null, limit: number): Promise<Row[]> {
    let query = supabase().from(table).select("*").order("updated_at", { ascending: true }).limit(limit);
    if (since) query = query.gt("updated_at", since);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Row[];
  },

  async pullCatalog(since: string | null, offset: number, limit: number): Promise<Row[]> {
    let query = supabase()
      .from("catalog_products")
      .select(CATALOG_COLUMNS)
      .order("price_changed_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    // First download: what is on the shelf. After that, every change, including items going out of stock.
    query = since ? query.gt("price_changed_at", since) : query.eq("in_stock", true);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as Row[];
  },
};
