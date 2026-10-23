// Money alerts: a kind of spending at 80% and at 100% of its plan (once each a month, to the
// people at home), and a question about an entry (once, to the person asked). Each carries a key
// the server records, so it's sent once. Quiet hours hold them until morning.
import { flexSummary, type Kind } from "@/lib/money/flex";
import type { Budget, Entry } from "@/lib/money/money";
import { isQuiet, type Alert } from "./plan";

export type Review = { id: string; entry_id: string; ask_to?: string | null; question?: string | null; status: string; actor_id?: string | null; deleted_at?: string | null };
export type MoneyAlert = Alert & { key: string };
type Person = { id: string; name: string; active?: boolean; is_remote?: boolean };

const kes = (x: number) => `KES ${Math.round(x).toLocaleString("en-KE")}`;

export function planMoneyAlerts(kinds: Kind[], budgets: Budget[], entries: Entry[], reviews: Review[], people: Person[], now: number): MoneyAlert[] {
  if (isQuiet(now)) return [];
  const today = new Date(now + 3 * 3600_000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const home = people.filter((p) => p.active !== false && !p.is_remote).map((p) => p.id);
  const out: MoneyAlert[] = [];

  for (const r of flexSummary(kinds, budgets, entries, month, today).rows) {
    if (r.available <= 0) continue;
    const level = r.spent >= r.available ? 100 : r.spent >= 0.8 * r.available ? 80 : 0;
    if (!level) continue;
    out.push({
      key: `budget:${r.kind.id}:${month}:${level}`,
      kind: "funds",
      to: home,
      url: "/money",
      title: level === 100 ? `${r.kind.name}: this month's budget is used up` : `${r.kind.name}: 80% of this month's budget used`,
      body: `${kes(r.spent)} of ${kes(r.available)}${level === 100 ? "" : `, ${kes(r.left)} left`}.`,
    });
  }

  const nameOf = (id?: string | null) => people.find((p) => p.id === id)?.name ?? "Someone";
  for (const v of reviews) {
    if (v.deleted_at || v.status !== "open") continue;
    const to = v.ask_to ? [v.ask_to] : home;
    const e = entries.find((x) => x.id === v.entry_id);
    out.push({
      key: `review:${v.id}`,
      kind: "funds",
      to: to.filter((m) => m !== v.actor_id),
      url: "/money#entries",
      title: `${nameOf(v.actor_id)} has a question about a payment`,
      body: `${v.question || "Can you check this?"}${e ? ` (${e.note || e.counterparty || "payment"}, ${kes(Number(e.amount_kes))})` : ""}`,
    });
  }
  return out;
}
