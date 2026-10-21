import Dexie, { type Table } from "dexie";
import { SYNC_TABLES, type Row, type SyncTable } from "./tables";

export type Op = "insert" | "update" | "delete";

export type OutboxEntry = {
  seq?: number;
  id: string; // mutation id, sent to the server so a retry counts once
  table: SyncTable;
  op: Op;
  row: Row;
  createdAt: string;
  status: "pending" | "rejected";
  reason?: string;
};

export type MetaEntry = { key: string; value: unknown };

export class LocalDB extends Dexie {
  outbox!: Table<OutboxEntry, number>;
  meta!: Table<MetaEntry, string>;

  constructor(name = "kimemiah") {
    super(name);
    const stores: Record<string, string> = {
      outbox: "++seq, id, status, table",
      meta: "key",
    };
    for (const t of SYNC_TABLES) stores[t] = "id, updated_at";
    this.version(1).stores(stores);
    // Supermarket prices kept offline: a few hundred rows from offline_price_matches.
    this.version(2).stores({ local_catalog_matches: "id, store, canonical_concept, canonical_group_key" });
    // The whole Naivas / Quickmart catalog, kept up to date with only the rows whose price changed.
    this.version(3).stores({
      local_catalog_matches: null,
      catalog_products: "id, store, category_group, canonical_concept, canonical_group_key",
    });
  }

  get catalog(): Table<Row, string> {
    return this.table("catalog_products");
  }

  rows(table: SyncTable): Table<Row, string> {
    return this.table(table);
  }
}

export async function getMeta<T>(db: LocalDB, key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(db: LocalDB, key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
