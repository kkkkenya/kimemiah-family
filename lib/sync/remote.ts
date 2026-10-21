"use client";

import { supabase } from "@/lib/supabase/client";
import { NotUnlockedError, type ApplyResult, type Mutation, type Remote } from "./engine";
import type { Row, SyncTable } from "./tables";

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
};
