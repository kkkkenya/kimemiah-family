import "server-only";
import { billJob, billsDue, type Bill } from "@/lib/money/bills";
import type { Entry } from "@/lib/money/money";
import type { adminClient } from "./supabase-admin";

/** Posts a job for each bill due within two days, once; the unique index stops a second copy. */
export async function ensureBillJobs(db: ReturnType<typeof adminClient>, now: Date): Promise<number> {
  const { data: bills } = await db.from("bills").select("*").is("deleted_at", null);
  if (!bills?.length) return 0;
  const cols = "id, direction, occurred_on, amount_kes, bill_id, usage_qty, voids_entry_id, project_id, deleted_at";
  const [{ data: paid }, { data: voids }] = await Promise.all([
    db.from("money_entries").select(cols).not("bill_id", "is", null),
    db.from("money_entries").select(cols).not("voids_entry_id", "is", null),
  ]);
  const today = new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
  // A bill job finished in the last 3 days without a payment logged isn't posted again straight away.
  const since = new Date(now.getTime() - 3 * 86400_000).toISOString();
  const { data: recent } = await db.from("jobs").select("template_key").like("template_key", "bill:%").gte("done_at", since);
  const justDone = new Set((recent ?? []).map((j) => j.template_key));
  let posted = 0;
  for (const { bill, stats } of billsDue(bills as Bill[], [...(paid ?? []), ...(voids ?? [])] as Entry[], today, 2)) {
    if (justDone.has(`bill:${bill.id}`)) continue;
    const { error } = await db.from("jobs").insert(billJob(bill, stats));
    if (!error) posted++;
  }
  return posted;
}
