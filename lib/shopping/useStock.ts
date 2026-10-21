"use client";

import { useMemo } from "react";
import { sortShops, type Shop, type StockItem } from "@/lib/shopping/shops";
import { withLocalCounts, type Movement } from "@/lib/shopping/stock";
import { useMe, useRows, type Member } from "@/lib/sync/hooks";

/** Stock with this phone's unsynced +/- included, plus what the Stock and Shop tabs both need. */
export function useStock() {
  const me = useMe();
  const shops = sortShops(useRows<Shop>("shops") ?? []);
  const stockRows = useRows<StockItem>("stock_items");
  const movementRows = useRows<Movement & { id: string }>("stock_movements");
  const movements = useMemo(() => movementRows ?? [], [movementRows]);
  // Counts include this phone's unsynced +/-, the same sum the server keeps.
  const stock = useMemo(() => withLocalCounts(stockRows ?? [], movements, me?.id), [stockRows, movements, me?.id]);
  const members = useRows<Member>("members") ?? [];
  return { me, shops, stock, movements, members, loaded: stockRows !== undefined };
}
