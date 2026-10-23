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

// Tables added after the first version get their own Dexie version below.
// Tables the first version had that the app no longer syncs (removed in version 6).
const REMOVED = ["meals", "meal_ingredients", "meal_slots"];

const LATER: ReadonlySet<SyncTable> = new Set<SyncTable>(["job_participants", "job_rota", "projects", "bills"]);

export class LocalDB extends Dexie {
  outbox!: Table<OutboxEntry, number>;
  meta!: Table<MetaEntry, string>;

  constructor(name = "kimemiah") {
    super(name);
    const stores: Record<string, string> = {
      outbox: "++seq, id, status, table",
      meta: "key",
    };
    for (const t of [...SYNC_TABLES, ...REMOVED]) if (!LATER.has(t as SyncTable)) stores[t] = "id, updated_at";
    this.version(1).stores(stores);
    // Supermarket prices kept offline: a few hundred rows from offline_price_matches.
    this.version(2).stores({ local_catalog_matches: "id, store, canonical_concept, canonical_group_key" });
    // The whole Naivas / Quickmart catalog, kept up to date with only the rows whose price changed.
    this.version(3).stores({
      local_catalog_matches: null,
      catalog_products: "id, store, category_group, canonical_concept, canonical_group_key",
    });
    // Who is doing each job and their share (written only through the server's join functions).
    this.version(4).stores({ job_participants: "id, updated_at, job_id" });
    // The weekly sign-up grid for daily jobs.
    this.version(5).stores({ job_rota: "id, updated_at" });
    // Meals were removed (cooking is a job): drop the local copies.
    this.version(6).stores({ meals: null, meal_ingredients: null, meal_slots: null });
    // Projects the family saves up for (house work, upgrades).
    this.version(7).stores({ projects: "id, updated_at" });
    // Bills (water, gas, internet) and how much of each the house uses.
    this.version(8).stores({ bills: "id, updated_at" });
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
