"use client";

// Steps that touch several tabs at once, queued together so every tab updates from one tap
// (Stock, Shop, Jobs and the spend log), offline too.

import { putAwayMovements, spendByShop, type PutAwayLine } from "@/lib/shopping/stock";
import type { Job } from "@/lib/jobs/logic";
import { monthOf, monthSummary, projectProgress, runsToUnlock, type Entry, type FundedJob, type Project } from "@/lib/money/money";
import { localDB, syncEngine } from "./client";

const nairobiToday = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

export type RestockOptions = {
  meId?: string | null;
  logSpend: boolean;
  tripId?: string | null;
  /** From a receipt: one spend entry for the receipt total at this shop, instead of one per shop from line prices. */
  receipt?: { shopId: string | null; total: number; note: string };
  /** Save each line's price as the item's usual price. */
  savePrices?: boolean;
  /** Basket rows to clear once they're put away. */
  extraIds?: string[];
};

/**
 * Shopping done (or a receipt read): bought amounts go into stock, OK / Low / Out items go back
 * to OK, prices are saved, the spend is logged, the basket is cleared, the trip is finished and
 * today's supermarket or market run job is marked done.
 */
export async function restockHouse(lines: PutAwayLine[], o: RestockOptions): Promise<{ spent: number; runsDone: number }> {
  const engine = syncEngine();
  for (const m of putAwayMovements(lines)) {
    if (m.level) await engine.queue("stock_items", "update", { id: m.item_id, level: "ok" });
    await engine.queue("stock_movements", "insert", { id: crypto.randomUUID(), item_id: m.item_id, delta: m.delta, reason: "put_away", trip_id: o.tripId ?? null });
  }
  if (o.savePrices) {
    for (const l of lines) if (l.itemId && l.price && l.price > 0) await engine.queue("stock_items", "update", { id: l.itemId, usual_price_kes: Math.round(l.price) });
  }

  let spent = 0;
  if (o.logSpend) {
    const entries = o.receipt ? (o.receipt.total > 0 ? [o.receipt] : []) : spendByShop(lines);
    for (const g of entries) {
      await engine.queue("money_entries", "insert", {
        id: crypto.randomUUID(),
        direction: "out",
        occurred_on: nairobiToday(),
        amount_kes: Math.round(g.total),
        method: null,
        spent_by: o.meId ?? null,
        shop_id: g.shopId,
        category_id: null,
        trip_id: o.tripId ?? null,
        note: g.note,
        voids_entry_id: null,
      });
      spent += Math.round(g.total);
    }
  }

  for (const id of o.extraIds ?? []) await engine.queue("shopping_extras", "delete", { id });
  if (o.tripId) await engine.queue("shopping_trips", "update", { id: o.tripId, finished_at: new Date().toISOString() });

  // The shopping run on the Jobs board (due today or earlier) is done.
  const jobs = (await localDB().rows("jobs").toArray()) as unknown as Job[];
  const runs = jobs.filter((j) => !j.done_at && !j.deleted_at && j.category === "shopping_errand" && j.requires_funds && (!j.planned_for || j.planned_for <= nairobiToday()));
  for (const j of runs) await engine.queue("jobs", "update", { id: j.id, done_at: new Date().toISOString(), done_by: o.meId ?? null });

  return { spent, runsDone: runs.length };
}

// ---------------------------------------------------------------- money

export type NewEntry = {
  direction: "in" | "out";
  amount_kes: number;
  occurred_on: string;
  category_id?: string | null;
  project_id?: string | null;
  shop_id?: string | null;
  method?: "mpesa" | "bank" | "cash" | "other" | null;
  spent_by?: string | null;
  note?: string | null;
  counterparty?: string | null;
  mpesa_code?: string | null;
  bill_id?: string | null;
  usage_qty?: number | null;
  paid_from?: "house" | "own";
  payback_to?: string | null;
};

/**
 * Log money in or out. Then: money in that leaves enough this month unlocks the money runs it
 * covers ("Money ready"); money toward a project that reaches its target marks it funded and
 * unlocks its house-work job. An M-Pesa code already logged is refused.
 */
export async function logMoney(entry: NewEntry): Promise<{ error?: string; unlocked: string[]; funded?: string }> {
  const db = localDB();
  const engine = syncEngine();
  const all = (await db.rows("money_entries").toArray()) as unknown as Entry[];
  if (entry.mpesa_code && all.some((e) => e.mpesa_code === entry.mpesa_code && !e.deleted_at)) {
    return { error: `That M-Pesa message (${entry.mpesa_code}) is already logged.`, unlocked: [] };
  }
  const row = { id: crypto.randomUUID(), voids_entry_id: null, trip_id: null, ...entry, amount_kes: Math.round(entry.amount_kes) };
  await engine.queue("money_entries", "insert", row);
  const entries = [...all, row as unknown as Entry];

  const unlocked: string[] = [];
  let funded: string | undefined;
  const jobs = (await db.rows("jobs").toArray()) as unknown as (Job & FundedJob)[];
  if (entry.direction === "in" && !entry.project_id) {
    // A project's job waits for that project's own money, not the household's.
    const projectJobs = new Set(((await db.rows("projects").toArray()) as unknown as Project[]).map((p) => p.job_id).filter(Boolean));
    const { left } = monthSummary(entries, monthOf(entry.occurred_on));
    for (const id of runsToUnlock(jobs.filter((j) => !projectJobs.has(j.id)), left)) {
      await engine.queue("jobs", "update", { id, funds_status: "funds_ready" });
      unlocked.push(jobs.find((j) => j.id === id)?.title ?? "");
    }
  }
  if (entry.project_id) {
    const project = (await db.rows("projects").get(entry.project_id)) as unknown as Project | undefined;
    if (project && project.status === "saving" && projectProgress(project, entries).funded) {
      await engine.queue("projects", "update", { id: project.id, status: "funded" });
      funded = project.title;
      if (project.job_id) {
        await engine.queue("jobs", "update", { id: project.job_id, funds_status: "funds_ready" });
        unlocked.push(jobs.find((j) => j.id === project.job_id)?.title ?? project.title);
      }
    }
  }
  return { unlocked, funded };
}

/** A correction: a new entry that cancels a wrong one (entries are never edited or deleted). */
export async function correctEntry(e: Entry) {
  await syncEngine().queue("money_entries", "insert", {
    id: crypto.randomUUID(),
    direction: e.direction,
    amount_kes: e.amount_kes,
    occurred_on: e.occurred_on,
    voids_entry_id: e.id,
    note: `Correction of: ${e.note ?? e.counterparty ?? "an entry"}`,
  });
}

/**
 * "Ask at the meeting": puts a question on the next family meeting's agenda, planning that
 * meeting for Sunday if none is planned yet. Returns the meeting day.
 */
export async function flagForMeeting(title: string, jobId: string | null = null): Promise<string> {
  const db = localDB();
  const engine = syncEngine();
  type Meeting = { id: string; held_on: string; status: string; deleted_at?: string | null };
  const meetings = ((await db.rows("meetings").toArray()) as unknown as Meeting[]).filter((m) => !m.deleted_at && m.status === "planned").sort((a, b) => a.held_on.localeCompare(b.held_on));
  let next = meetings[0];
  if (!next) {
    const today = new Date(Date.now() + 3 * 3600_000);
    const sunday = new Date(today.getTime() + ((7 - today.getUTCDay()) % 7) * 86_400_000).toISOString().slice(0, 10);
    next = { id: crypto.randomUUID(), held_on: sunday, status: "planned" };
    await engine.queue("meetings", "insert", { ...next, host_id: null, notes: null });
  }
  const items = ((await db.rows("agenda_items").toArray()) as unknown as { meeting_id: string; sort: number; deleted_at?: string | null }[]).filter((a) => a.meeting_id === next.id && !a.deleted_at);
  const sort = Math.max(0, ...items.map((a) => a.sort)) + 1;
  await engine.queue("agenda_items", "insert", { id: crypto.randomUUID(), meeting_id: next.id, title: title.slice(0, 120), minutes: 5, source: "flag", source_job_id: jobId, sort });
  return next.held_on;
}
