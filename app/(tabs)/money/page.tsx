"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Screen } from "@/components/Screen";
import { useSync } from "@/components/SyncProvider";
import { UndoBar, type UndoState } from "@/components/UndoBar";
import { EntryForm, type Draft } from "@/components/money/EntryForm";
import { Bills } from "@/components/money/Bills";
import { Projects } from "@/components/money/Projects";
import type { Bill } from "@/lib/money/bills";
import { dayPlus, dueOnDay, postJob } from "@/lib/jobs/actions";
import { budgetAvailable, cashFlow, foodStats, liveEntries, monthSummary, projectProgress, summaryText, type Entry, type Project } from "@/lib/money/money";
import { whatsappHref } from "@/lib/contacts";
import { kes } from "@/lib/shopping/pricing";
import { syncEngine } from "@/lib/sync/client";
import { useMe, useRows } from "@/lib/sync/hooks";
import type { Row } from "@/lib/sync/tables";
import { correctEntry, flagForMeeting, logMoney, type NewEntry } from "@/lib/sync/workflows";

type Category = Row & { name: string; sort: number; rollover?: boolean };
type Budget = Row & { month: string; category_id: string; amount_kes: number };
type Shop = Row & { name: string };
type Person = Row & { name: string; is_remote?: boolean; phone?: string | null };

const thisMonth = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 7);
const shift = (m: string, by: number) => {
  const d = new Date(`${m}-15T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};
const monthLabel = (m: string) => new Date(`${m}-15T09:00:00Z`).toLocaleDateString("en-KE", { month: "long", year: "numeric" });
const day = (d: string) => new Date(`${d}T09:00:00Z`).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" });

// Money: this month's in, out and what's left; logging (or pasting an M-Pesa SMS); projects the
// family saves for; budgets by category; corrections; and the summary for Peter.
export default function MoneyPage() {
  const { syncNow } = useSync();
  const me = useMe();
  const entries = (useRows<Entry & { id: string }>("money_entries") ?? []) as Entry[];
  const projects = (useRows<Project & { id: string }>("projects") ?? []) as Project[];
  const categories = (useRows<Category>("budget_categories") ?? []).sort((a, b) => a.sort - b.sort);
  const budgets = useRows<Budget>("budgets") ?? [];
  const people = (useRows<Person>("members") ?? []) as Person[];
  const shops = useRows<Shop>("shops") ?? [];
  const billRows = useRows<Bill & { id: string }>("bills");
  const bills = useMemo(() => (billRows ?? []) as Bill[], [billRows]);
  const todayDay = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const [payId, setPayId] = useState<string | null>(null);
  useEffect(() => setPayId(new URLSearchParams(window.location.search).get("pay")), []);
  useEffect(() => {
    const b = payId ? bills.find((x) => x.id === payId) : undefined;
    if (!b) return;
    setForm({ direction: "out", bill_id: b.id, category_id: b.category_id ?? null, note: b.name, amount_kes: b.usual_kes ?? undefined });
    setPayId(null);
    window.history.replaceState(null, "", "/money");
  }, [payId, bills]);
  const [month, setMonth] = useState(thisMonth());
  const [form, setForm] = useState<Draft | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoState>(null);
  const closeUndo = useCallback(() => setUndo(null), []);

  const s = monthSummary(entries, month);
  const flow = cashFlow(entries, month);
  const flowTop = Math.max(1, ...flow.flatMap((f) => [f.moneyIn, f.moneyOut]));
  const food = foodStats(entries, month, new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10));
  const foodTop = Math.max(1, ...food.trend.map((t) => t.total));
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Other";
  const live = liveEntries(entries);
  const shown = live.filter((e) => e.occurred_on.startsWith(month)).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
  const peter = people.find((p) => p.is_remote);
  const summary = summaryText(
    month,
    s,
    catName,
    projects.filter((p) => !p.deleted_at && p.status !== "done").map((p) => ({ title: p.title, raised: projectProgress(p, entries).raised, target: Number(p.target_kes) })),
  );

  async function save(e: NewEntry): Promise<string | null> {
    const r = await logMoney(e);
    if (r.error) return r.error;
    void syncNow();
    setForm(null);
    const extra = [r.funded && `${r.funded} is fully funded`, r.unlocked.length && `money ready for ${r.unlocked.join(", ")}`].filter(Boolean).join(" · ");
    setUndo({ id: Date.now(), message: `${e.direction === "in" ? "+" : "−"}${kes(e.amount_kes)} logged${extra ? ` · ${extra}` : ""}` });
    return null;
  }

  async function newProject(p: { title: string; kind: Project["kind"]; target_kes: number; notes: string; postJob: boolean; target_date: string | null }) {
    let jobId: string | null = null;
    if (p.postJob) {
      jobId = await postJob({
        title: p.title,
        notes: p.notes || null,
        category: "maintenance_fix",
        strain: "medium",
        duration_min: 120,
        people_needed: 2,
        due_at: dueOnDay(dayPlus(14)),
        requires_funds: true,
        estimated_cost_kes: p.target_kes,
        planned_for: dayPlus(14),
      });
    }
    await syncEngine().queue("projects", "insert", { id: crypto.randomUUID(), title: p.title, kind: p.kind, target_kes: p.target_kes, notes: p.notes || null, job_id: jobId, status: "saving", target_date: p.target_date });
    void syncNow();
    setUndo({ id: Date.now(), message: `Saving for ${p.title}${jobId ? " · posted on Jobs" : ""}` });
  }

  async function ask(title: string) {
    const day = await flagForMeeting(title);
    void syncNow();
    setUndo({ id: Date.now(), message: `On the agenda for ${new Date(`${day}T09:00:00Z`).toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "short" })}` });
  }

  async function addYearly(name: string, yearly: number) {
    const id = crypto.randomUUID();
    await syncEngine().queue("budget_categories", "insert", { id, name, sort: categories.length + 1, rollover: true });
    await syncEngine().queue("budgets", "insert", { id: crypto.randomUUID(), month: `${month}-01`, category_id: id, amount_kes: Math.ceil(yearly / 12) });
    void syncNow();
    setUndo({ id: Date.now(), message: `${name}: putting aside ${kes(Math.ceil(yearly / 12))} a month` });
  }

  async function setBudget(categoryId: string, amount: number) {
    const m = `${month}-01`;
    const existing = budgets.find((b) => b.category_id === categoryId && b.month === m);
    if (existing) await syncEngine().queue("budgets", "update", { id: existing.id, amount_kes: amount });
    else await syncEngine().queue("budgets", "insert", { id: crypto.randomUUID(), month: m, category_id: categoryId, amount_kes: amount });
    void syncNow();
  }

  return (
    <Screen title="Money">
      <Card>
        <div className="flex items-center justify-between gap-2">
          <button type="button" aria-label="Previous month" onClick={() => setMonth(shift(month, -1))} className="flex size-12 items-center justify-center rounded-full text-brand">
            ‹
          </button>
          <h2 className="font-display text-xl">{monthLabel(month)}</h2>
          <button type="button" aria-label="Next month" disabled={month >= thisMonth()} onClick={() => setMonth(shift(month, 1))} className="flex size-12 items-center justify-center rounded-full text-brand disabled:opacity-30">
            ›
          </button>
        </div>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-center tabular">
          <div className="rounded-xl bg-base p-2">
            <dt className="text-xs text-muted">In</dt>
            <dd className="font-bold">{kes(s.moneyIn)}</dd>
          </div>
          <div className="rounded-xl bg-base p-2">
            <dt className="text-xs text-muted">Spent</dt>
            <dd className="font-bold">{kes(s.moneyOut)}</dd>
          </div>
          <div className={`rounded-xl p-2 ${s.left < 0 ? "bg-low-bg text-low-fg" : "bg-ok-bg text-ok-fg"}`}>
            <dt className="text-xs">Left</dt>
            <dd className="text-lg font-bold">{kes(s.left)}</dd>
          </div>
        </dl>
        {!form && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setForm({ direction: "in" })} className="min-h-12 rounded-xl bg-brand font-bold text-brand-contrast">
              + Money in
            </button>
            <button type="button" onClick={() => setForm({ direction: "out" })} className="min-h-12 rounded-xl border border-brand font-bold text-brand">
              − Money out
            </button>
          </div>
        )}
        <a
          href={whatsappHref(peter?.phone, summary) ?? `https://wa.me/?text=${encodeURIComponent(summary)}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex min-h-12 items-center justify-center rounded-xl px-4 font-bold text-brand underline underline-offset-4"
        >
          Send this month&apos;s summary to {peter?.name.split(" ")[0] ?? "Peter"} on WhatsApp
        </a>
      </Card>

      {form && <EntryForm start={form} categories={categories} projects={projects} bills={bills} meId={me?.id} onSave={save} onCancel={() => setForm(null)} />}

      <Bills
        bills={bills}
        entries={entries}
        today={todayDay}
        onPay={(b) => {
          setForm({ direction: "out", bill_id: b.id, category_id: b.category_id ?? null, note: b.name, amount_kes: b.usual_kes ?? undefined });
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onAdd={async (b) => {
          await syncEngine().queue("bills", "insert", { id: crypto.randomUUID(), category_id: categories.find((c) => c.name === "Utilities")?.id ?? null, sort: bills.length + 1, ...b });
          void syncNow();
          setUndo({ id: Date.now(), message: `${b.name} added to bills` });
        }}
        onRemove={async (b) => {
          await syncEngine().queue("bills", "delete", { id: b.id });
          void syncNow();
          setUndo({ id: Date.now(), message: `${b.name} removed from bills. Its payments stay in Money.` });
        }}
      />

      <Card>
        <h2 className="font-display text-xl">Food</h2>
        <p className="text-sm text-muted">Log one total per shop or market trip under Food or Market and fresh.</p>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-center tabular">
          <div className="rounded-xl bg-base p-2">
            <dt className="text-xs text-muted">{monthLabel(month).split(" ")[0]}</dt>
            <dd className="text-lg font-bold">{kes(food.total)}</dd>
          </div>
          <div className="rounded-xl bg-base p-2">
            <dt className="text-xs text-muted">About a week</dt>
            <dd className="text-lg font-bold">{kes(food.perWeek)}</dd>
          </div>
        </dl>
        {food.lastMonth > 0 && (
          <p className="mt-2 text-sm">
            {food.total >= food.lastMonth ? `${kes(food.total - food.lastMonth)} more` : `${kes(food.lastMonth - food.total)} less`} than {monthLabel(shift(month, -1)).split(" ")[0]} ({kes(food.lastMonth)})
          </p>
        )}
        {food.byShop.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {food.byShop.map(([id, v]) => (
              <li key={id ?? "none"} className="flex justify-between gap-2">
                <span>{shops.find((x) => x.id === id)?.name ?? "No shop given"}</span>
                <span className="font-bold tabular">{kes(v)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex h-24 items-end gap-2" role="img" aria-label={`Food spending, last six months: ${food.trend.map((t) => `${monthLabel(t.month)} ${kes(t.total)}`).join(", ")}`}>
          {food.trend.map((t) => (
            <div key={t.month} className="flex flex-1 flex-col items-center gap-1">
              <div className={`w-full rounded-t-md ${t.month === month ? "bg-brand" : "bg-line"}`} style={{ height: `${Math.max(2, (t.total / foodTop) * 72)}px` }} />
              <span className="text-xs text-muted">{new Date(`${t.month}-15T09:00:00Z`).toLocaleDateString("en-KE", { month: "short" })}</span>
            </div>
          ))}
        </div>
      </Card>

      <Projects
        projects={projects}
        entries={entries}
        onNew={newProject}
        onGive={(p) => setForm({ direction: "in", project_id: p.id, note: `For ${p.title}` })}
        onSpend={(p) => setForm({ direction: "out", project_id: p.id, note: p.title })}
        onDone={(p) => syncEngine().queue("projects", "update", { id: p.id, status: "done" }).then(() => void syncNow())}
        today={todayDay}
      />

      <Card>
        <h2 className="font-display text-xl">Cash flow</h2>
        <p className="text-sm text-muted">Money in against money spent, month by month. Project money is left out.</p>
        <div className="mt-3 flex h-32 items-end gap-2" role="img" aria-label={flow.map((f) => `${monthLabel(f.month)}: in ${kes(f.moneyIn)}, spent ${kes(f.moneyOut)}`).join("; ")}>
          {flow.map((f) => (
            <div key={f.month} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-28 w-full items-end justify-center gap-0.5">
                <div className="w-1/2 rounded-t-md bg-ok-fg" style={{ height: `${Math.max(2, (f.moneyIn / flowTop) * 112)}px` }} />
                <div className={`w-1/2 rounded-t-md ${f.month === month ? "bg-brand" : "bg-line"}`} style={{ height: `${Math.max(2, (f.moneyOut / flowTop) * 112)}px` }} />
              </div>
              <span className="text-xs text-muted">{new Date(`${f.month}-15T09:00:00Z`).toLocaleDateString("en-KE", { month: "short" })}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted">
          <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-ok-fg align-middle" />In</span>
          <span><span className="mr-1 inline-block size-2.5 rounded-sm bg-brand align-middle" />Spent</span>
        </p>
        {flow.at(-1)!.moneyIn > 0 && (
          <p className="mt-2 text-sm">
            {flow.at(-1)!.kept >= 0 ? `Kept ${kes(flow.at(-1)!.kept)} of what came in (${flow.at(-1)!.keptPct}%)` : `Spent ${kes(-flow.at(-1)!.kept)} more than came in`} this month.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="font-display text-xl">Budget</h2>
        <p className="text-sm text-muted">Spending this month by kind, against what you planned. A plan repeats each month until you change it. Tap a budget to change it.</p>
        <ul className="mt-2 flex flex-col gap-3">
          {categories.map((c) => {
            const b = budgetAvailable(budgets, entries, c.id, month, !!c.rollover);
            const { spent, plan } = b;
            const over = b.available > 0 && spent > b.available;
            return (
              <li key={c.id}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-bold">{c.name}</span>
                  <span className="tabular">
                    {kes(spent)} of{" "}
                    <button
                      type="button"
                      onClick={() => {
                        const v = window.prompt(`Budget for ${c.name} in ${monthLabel(month)} (KES)`, plan ? String(plan) : "");
                        const n = Number((v ?? "").replace(/[, ]/g, ""));
                        if (v !== null && n >= 0) void setBudget(c.id, n);
                      }}
                      className="font-bold text-brand underline underline-offset-4"
                    >
                      {plan ? kes(plan) : "set a budget"}
                    </button>
                  </span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-base" aria-hidden="true">
                  <div className={`h-full ${over ? "bg-out-strong" : "bg-brand"}`} style={{ width: `${b.available > 0 ? Math.min(100, (spent / b.available) * 100) : spent ? 100 : 0}%` }} />
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 text-xs text-muted">
                  <span>{c.rollover && b.carry !== 0 ? `${b.carry > 0 ? "+" : "−"}${kes(Math.abs(b.carry))} carried in · ${kes(b.left)} left` : plan ? `${kes(b.left)} left` : ""}</span>
                  <button
                    type="button"
                    onClick={() => syncEngine().queue("budget_categories", "update", { id: c.id, rollover: !c.rollover }).then(() => void syncNow())}
                    className="min-h-10 font-bold underline underline-offset-4"
                  >
                    {c.rollover ? "↻ Leftovers carry over" : "Carry leftovers over"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {s.byCategory.get(null) ? <p className="mt-2 text-sm text-muted">Not sorted into a kind: {kes(s.byCategory.get(null)!)}</p> : null}
        <button
          type="button"
          onClick={() => {
            const name = window.prompt("A cost that comes once or twice a year (e.g. School fees, Car insurance):")?.trim();
            if (!name) return;
            const v = Number((window.prompt(`How much is ${name} for the whole year? (KES)`) ?? "").replace(/[, ]/g, ""));
            if (v > 0) void addYearly(name, v);
          }}
          className="mt-3 min-h-12 rounded-xl border border-line px-4 text-sm font-bold"
        >
          + Save up for a yearly cost
        </button>
      </Card>

      <Card>
        <h2 className="font-display text-xl">Entries</h2>
        {shown.length ? (
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {shown.map((e) => {
              const project = projects.find((p) => p.id === e.project_id);
              return (
                <li key={e.id} className="py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block font-bold">{e.note || e.counterparty || (e.direction === "in" ? "Money in" : "Spent")}</span>
                      <span className="text-sm text-muted">
                        {day(e.occurred_on)} · {project ? `${project.kind === "upgrade" ? "✨" : "🔨"} ${project.title}` : e.direction === "out" ? catName(e.category_id ?? null) : "The house"}
                        {e.mpesa_code ? ` · ${e.mpesa_code}` : ""}
                      </span>
                    </span>
                    <span className={`shrink-0 font-bold tabular ${e.direction === "in" ? "text-ok-fg" : ""}`}>
                      {e.direction === "in" ? "+" : "−"}
                      {kes(e.amount_kes)}
                    </span>
                  </div>
                  {fixing === e.id ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      <span>Cancel this entry with a correction?</span>
                      <button
                        type="button"
                        onClick={async () => {
                          await correctEntry(e);
                          void syncNow();
                          setFixing(null);
                          setUndo({ id: Date.now(), message: "Correction logged. The entry no longer counts." });
                        }}
                        className="min-h-10 rounded-lg bg-brand px-3 font-bold text-brand-contrast"
                      >
                        Yes, correct it
                      </button>
                      <button type="button" onClick={() => setFixing(null)} className="min-h-10 px-2 font-bold text-brand">
                        Keep it
                      </button>
                    </div>
                  ) : (
                    <span className="mt-1 flex flex-wrap gap-x-4">
                      <button type="button" onClick={() => setFixing(e.id)} className="min-h-10 text-sm font-bold text-muted underline underline-offset-4">
                        Wrong? Correct it
                      </button>
                      <button type="button" onClick={() => void ask(`About ${e.note || e.counterparty || "a payment"}: ${kes(e.amount_kes)} on ${day(e.occurred_on)}`)} className="min-h-10 text-sm font-bold text-muted underline underline-offset-4">
                        Ask at the meeting
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-muted">Nothing logged for {monthLabel(month)} yet.</p>
        )}
      </Card>

      <UndoBar state={undo} onClose={closeUndo} />
    </Screen>
  );
}
