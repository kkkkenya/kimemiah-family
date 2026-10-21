"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { localDB } from "./client";
import type { Row, SyncTable } from "./tables";

// Live rows from this phone's copy, without soft-deleted ones.
export function useRows<T extends Row = Row>(table: SyncTable): T[] | undefined {
  return useLiveQuery(
    async () => (await localDB().rows(table).toArray()).filter((r) => !r.deleted_at) as T[],
    [table],
  );
}

export function useMeta<T>(key: string): T | undefined {
  return useLiveQuery(async () => (await localDB().meta.get(key))?.value as T | undefined, [key]);
}

export type Member = Row & { name: string; is_remote: boolean; active: boolean; sort: number };

export function useMe(): Member | undefined {
  const memberId = useMeta<string>("memberId");
  const members = useRows<Member>("members");
  return members?.find((m) => m.id === memberId);
}
