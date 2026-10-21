import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { LocalDB } from "./db";
import { createSyncEngine, type ApplyResult, type Mutation, type Remote } from "./engine";
import type { Row, SyncTable } from "./tables";

// In-memory stand-in for the server: applies mutations once each, like apply_mutations.
class FakeRemote implements Remote {
  access = true;
  online = true;
  seen = new Set<string>();
  tables = new Map<SyncTable, Map<string, Row>>();
  reject = new Map<string, string>(); // row id -> reason
  clock = Date.parse("2026-10-21T10:00:00Z");
  calls = 0;

  private table(t: SyncTable) {
    if (!this.tables.has(t)) this.tables.set(t, new Map());
    return this.tables.get(t)!;
  }

  private stamp() {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  async hasAccess() {
    if (!this.online) throw new Error("network down");
    return this.access;
  }

  async applyMutations(mutations: Mutation[]): Promise<ApplyResult> {
    this.calls++;
    if (!this.online) throw new Error("network down");
    const result: ApplyResult = { applied: [], rejected: [] };
    for (const m of mutations) {
      if (this.seen.has(m.id)) {
        result.applied.push(m.id);
        continue;
      }
      const reason = this.reject.get(m.row.id);
      if (reason) {
        result.rejected.push({ id: m.id, reason });
        continue;
      }
      this.seen.add(m.id);
      const t = this.table(m.table);
      const existing = t.get(m.row.id);
      if (m.op === "insert") {
        if (!existing) t.set(m.row.id, { deleted_at: null, ...m.row, updated_at: this.stamp() });
      } else if (m.op === "update") {
        t.set(m.row.id, { ...existing!, ...m.row, updated_at: this.stamp() });
      } else {
        t.set(m.row.id, { ...existing!, deleted_at: new Date(this.clock).toISOString(), updated_at: this.stamp() });
      }
      result.applied.push(m.id);
    }
    return result;
  }

  catalog: Row[] = [];
  catalogCalls = 0;
  async pullCatalog(since: string | null, offset: number, limit: number) {
    this.catalogCalls++;
    const rows = this.catalog
      .filter((r) => (since ? (r.price_changed_at as string) > since : r.in_stock !== false))
      .sort((a, b) => (a.price_changed_at as string).localeCompare(b.price_changed_at as string));
    return rows.slice(offset, offset + limit);
  }

  async pull(t: SyncTable, since: string | null) {
    return [...this.table(t).values()]
      .filter((r) => !since || Date.parse(r.updated_at!) > Date.parse(since))
      .sort((a, b) => Date.parse(a.updated_at!) - Date.parse(b.updated_at!));
  }
}

let db: LocalDB;
let remote: FakeRemote;

beforeEach(async () => {
  db = new LocalDB(`test-${crypto.randomUUID()}`);
  await db.open();
  remote = new FakeRemote();
});

describe("sync engine", () => {
  it("saves a change on the phone immediately and sends it on sync", async () => {
    const engine = createSyncEngine(db, remote);
    await engine.queue("contacts", "insert", { id: "c1", name: "Fundi Otieno" });

    expect((await db.rows("contacts").get("c1"))?.name).toBe("Fundi Otieno");
    expect(await db.outbox.count()).toBe(1);

    const result = await engine.syncNow();
    expect(result).toMatchObject({ ok: true, applied: 1, rejected: 0 });
    expect(await db.outbox.count()).toBe(0);
    expect(remote.tables.get("contacts")?.get("c1")?.name).toBe("Fundi Otieno");
  });

  it("keeps changes while offline and sends them when back online", async () => {
    const engine = createSyncEngine(db, remote);
    remote.online = false;
    await engine.queue("contacts", "insert", { id: "c1", name: "Plumber" });

    const offline = await engine.syncNow();
    expect(offline.ok).toBe(false);
    expect(await db.outbox.where("status").equals("pending").count()).toBe(1);
    expect((await db.rows("contacts").get("c1"))?.name).toBe("Plumber");

    remote.online = true;
    const back = await engine.syncNow();
    expect(back).toMatchObject({ ok: true, applied: 1 });
    expect(await db.outbox.count()).toBe(0);
  });

  it("counts a change once even if it is sent twice", async () => {
    const engine = createSyncEngine(db, remote);
    await engine.queue("stock_movements", "insert", { id: "m1", item_id: "beans", delta: -1 });
    const [entry] = await db.outbox.toArray();
    // Simulate the first send reaching the server but the reply being lost.
    await remote.applyMutations([{ id: entry.id, table: entry.table, op: entry.op, row: entry.row }]);

    await engine.syncNow();
    expect(remote.tables.get("stock_movements")?.size).toBe(1);
    expect(await db.outbox.count()).toBe(0);
  });

  it("merges stock changes made on two phones while both were offline", async () => {
    const phoneA = createSyncEngine(db, remote);
    const dbB = new LocalDB(`test-${crypto.randomUUID()}`);
    const phoneB = createSyncEngine(dbB, remote);

    await phoneA.queue("stock_movements", "insert", { id: "a1", item_id: "beans", delta: -1 });
    await phoneB.queue("stock_movements", "insert", { id: "b1", item_id: "beans", delta: -2 });
    await phoneA.syncNow();
    await phoneB.syncNow();
    await phoneA.syncNow();

    const total = (await db.rows("stock_movements").toArray())
      .filter((r) => r.item_id === "beans")
      .reduce((sum, r) => sum + (r.delta as number), 0);
    expect(total).toBe(-3);
  });

  it("marks a rejected change, shows the reason, and undoes a rejected insert", async () => {
    const engine = createSyncEngine(db, remote);
    remote.reject.set("j1", "that item no longer exists");
    await engine.queue("jobs", "insert", { id: "j1", title: "Wash water tank" });

    const result = await engine.syncNow();
    expect(result).toMatchObject({ ok: true, rejected: 1 });
    const [entry] = await db.outbox.toArray();
    expect(entry.status).toBe("rejected");
    expect(entry.reason).toBe("that item no longer exists");
    expect(await db.rows("jobs").get("j1")).toBeUndefined();

    await engine.dismissRejected(entry.seq!);
    expect(await db.outbox.count()).toBe(0);
  });

  it("puts back pending local changes after a pull overwrites rows", async () => {
    const engine = createSyncEngine(db, remote);
    await engine.queue("contacts", "insert", { id: "c1", name: "Caretaker" });
    await engine.syncNow();

    remote.online = false;
    await engine.queue("contacts", "update", { id: "c1", phone: "0712 000 000" });
    // Server copy arrives without the phone number (e.g. pulled before the change was sent).
    await engine.pull().catch(() => undefined);
    remote.online = true;
    await engine.pull();
    expect((await db.rows("contacts").get("c1"))?.phone).toBeUndefined();
    await engine.reapplyPending();
    expect((await db.rows("contacts").get("c1"))?.phone).toBe("0712 000 000");
  });

  it("refuses to edit or remove insert-only entries such as money", async () => {
    const engine = createSyncEngine(db, remote);
    await expect(engine.queue("money_entries", "update", { id: "e1", amount_kes: 5 })).rejects.toThrow(
      /can't be changed/,
    );
    await expect(engine.queue("money_entries", "delete", { id: "e1" })).rejects.toThrow(/can't be changed/);
  });

  it("reports when the phone has been signed out", async () => {
    const engine = createSyncEngine(db, remote);
    remote.access = false;
    expect(await engine.syncNow()).toEqual({ ok: false, reason: "not_unlocked" });
  });

  it("runs one sync at a time", async () => {
    const engine = createSyncEngine(db, remote);
    await engine.queue("contacts", "insert", { id: "c1", name: "Gas delivery" });
    const [a, b] = await Promise.all([engine.syncNow(), engine.syncNow()]);
    expect(a).toBe(b);
    expect(remote.calls).toBe(1);
  });

  it("downloads the catalog once, then only rows whose price changed", async () => {
    const engine = createSyncEngine(db, remote);
    const t = (d: number) => `2026-10-${d}T02:00:00Z`;
    remote.catalog = [
      { id: "p1", title: "Rina Oil 2L", effective_price: 545, in_stock: true, price_changed_at: t(10) },
      { id: "p2", title: "Fresh Fri 2L", effective_price: 560, in_stock: true, price_changed_at: t(10) },
      { id: "p3", title: "Old Oil 2L", effective_price: 500, in_stock: false, price_changed_at: t(10) },
    ];
    await engine.syncNow();
    expect((await db.catalog.toArray()).map((r) => r.id).sort()).toEqual(["p1", "p2"]);

    // A week later: one price changed and one product left the shelf.
    remote.catalog[0] = { ...remote.catalog[0], effective_price: 499, price_changed_at: t(17) };
    remote.catalog[1] = { ...remote.catalog[1], in_stock: false, price_changed_at: t(17) };
    await engine.syncNow();
    expect(remote.catalogCalls).toBe(1); // checked within the hour already
    expect(await engine.refreshCatalog(true)).toBe(2); // only the two changed rows
    expect((await db.catalog.get("p1"))?.effective_price).toBe(499);
    expect((await db.catalog.get("p2"))?.in_stock).toBe(false);
  });
});
