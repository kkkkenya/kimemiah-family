import { getMeta, setMeta, type LocalDB, type Op, type OutboxEntry } from "./db";
import { INSERT_ONLY, SYNC_TABLES, type Row, type SyncTable } from "./tables";

export type Mutation = { id: string; table: SyncTable; op: Op; row: Row };

export type ApplyResult = {
  applied: string[];
  rejected: { id: string; reason: string }[];
};

// What the engine needs from the server. The real one wraps Supabase; tests use a fake.
export interface Remote {
  hasAccess(): Promise<boolean>;
  applyMutations(mutations: Mutation[]): Promise<ApplyResult>;
  pull(table: SyncTable, since: string | null, limit: number): Promise<Row[]>;
}

export class NotUnlockedError extends Error {
  constructor() {
    super("This phone is no longer signed in.");
    this.name = "NotUnlockedError";
  }
}

const BATCH = 100;
const PAGE = 1000;
// Pull a little before the last cursor so rows committed slightly out of order aren't missed.
const OVERLAP_MS = 60_000;
const PULL_CONCURRENCY = 6;

const cursorKey = (t: SyncTable) => `cursor:${t}`;

function newId(): string {
  return crypto.randomUUID();
}

function laterOf(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

export type SyncResult =
  | { ok: true; applied: number; rejected: number; pulled: number }
  | { ok: false; reason: "offline" | "not_unlocked" | "error"; message?: string };

export function createSyncEngine(db: LocalDB, remote: Remote) {
  let running: Promise<SyncResult> | null = null;

  async function applyLocally(entry: Pick<OutboxEntry, "table" | "op" | "row">): Promise<void> {
    const table = db.rows(entry.table);
    const now = new Date().toISOString();
    if (entry.op === "insert") {
      const existing = await table.get(entry.row.id);
      await table.put({ deleted_at: null, created_at: now, updated_at: now, ...existing, ...entry.row, _local: true });
    } else if (entry.op === "update") {
      await table.update(entry.row.id, { ...entry.row, _local: true });
    } else {
      await table.update(entry.row.id, { deleted_at: now, _local: true });
    }
  }

  // Record a change: saved on this phone straight away, sent to the server on the next sync.
  async function queue(table: SyncTable, op: Op, row: Row): Promise<string> {
    if (op !== "insert" && INSERT_ONLY.has(table)) {
      throw new Error(`${table} entries can't be changed or removed; add a correction instead.`);
    }
    const id = newId();
    await db.transaction("rw", db.outbox, db.rows(table), async () => {
      await db.outbox.add({ id, table, op, row, createdAt: new Date().toISOString(), status: "pending" });
      await applyLocally({ table, op, row });
    });
    return id;
  }

  async function flush(): Promise<{ applied: number; rejected: number }> {
    let applied = 0;
    let rejected = 0;
    for (;;) {
      const batch = await db.outbox.where("status").equals("pending").sortBy("seq");
      const slice = batch.slice(0, BATCH);
      if (slice.length === 0) break;

      const result = await remote.applyMutations(
        slice.map(({ id, table, op, row }) => ({ id, table, op, row })),
      );
      const appliedIds = new Set(result.applied);
      const rejectedById = new Map(result.rejected.map((r) => [r.id, r.reason]));

      const tablesToRepull = new Set<SyncTable>();
      await db.transaction("rw", [db.outbox, db.meta, ...SYNC_TABLES.map((t) => db.rows(t))], async () => {
        for (const entry of slice) {
          if (appliedIds.has(entry.id)) {
            await db.outbox.delete(entry.seq!);
            applied++;
          } else if (rejectedById.has(entry.id)) {
            await db.outbox.update(entry.seq!, { status: "rejected", reason: rejectedById.get(entry.id) });
            rejected++;
            // Undo what this phone assumed: a rejected insert never reached the server;
            // anything else is fixed by pulling that table again in full.
            if (entry.op === "insert") await db.rows(entry.table).delete(entry.row.id);
            else tablesToRepull.add(entry.table);
          }
        }
        for (const t of tablesToRepull) await db.meta.delete(cursorKey(t));
      });

      // The server answered for none of them: stop rather than loop forever.
      if (appliedIds.size === 0 && rejectedById.size === 0) break;
    }
    return { applied, rejected };
  }

  // Tables are pulled a few at a time: each is a round trip to the server.
  async function pull(): Promise<number> {
    const counts: number[] = [];
    const queue = [...SYNC_TABLES];
    const worker = async () => {
      for (let t = queue.shift(); t; t = queue.shift()) counts.push(await pullTable(t));
    };
    await Promise.all(Array.from({ length: PULL_CONCURRENCY }, worker));
    return counts.reduce((a, b) => a + b, 0);
  }

  async function pullTable(t: SyncTable): Promise<number> {
    let pulled = 0;
    const cursor = await getMeta<string>(db, cursorKey(t));
    let since: string | null = cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : null;
    let newest = cursor;
    for (;;) {
      const rows = await remote.pull(t, since, PAGE);
      if (rows.length === 0) break;
      await db.rows(t).bulkPut(rows);
      pulled += rows.length;
      for (const r of rows) newest = laterOf(newest, r.updated_at);
      if (rows.length < PAGE) break;
      since = rows[rows.length - 1].updated_at ?? since;
    }
    if (newest && newest !== cursor) await setMeta(db, cursorKey(t), newest);
    return pulled;
  }

  // After a pull overwrites rows with the server's copy, put back changes not yet accepted.
  async function reapplyPending(): Promise<void> {
    const pending = await db.outbox.where("status").equals("pending").sortBy("seq");
    for (const entry of pending) await applyLocally(entry);
  }

  async function run(): Promise<SyncResult> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { ok: false, reason: "offline" };
    }
    try {
      if (!(await remote.hasAccess())) throw new NotUnlockedError();
      const { applied, rejected } = await flush();
      const pulled = await pull();
      await reapplyPending();
      await setMeta(db, "lastSyncedAt", new Date().toISOString());
      await db.meta.delete("lastError");
      return { ok: true, applied, rejected, pulled };
    } catch (err) {
      if (err instanceof NotUnlockedError) return { ok: false, reason: "not_unlocked" };
      const message = err instanceof Error ? err.message : String(err);
      await setMeta(db, "lastError", message);
      return { ok: false, reason: "error", message };
    }
  }

  // One sync at a time; callers during a run share its result.
  function syncNow(): Promise<SyncResult> {
    if (!running) running = run().finally(() => (running = null));
    return running;
  }

  async function dismissRejected(seq: number): Promise<void> {
    await db.outbox.delete(seq);
  }

  return { queue, flush, pull, reapplyPending, syncNow, dismissRejected };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
