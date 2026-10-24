"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { Screen } from "@/components/Screen";
import { useSync } from "@/components/SyncProvider";
import { UndoBar, type UndoState } from "@/components/UndoBar";
import { Bills } from "@/components/money/Bills";
import { EntriesView } from "@/components/money/EntriesView";
import { EntryForm, type Draft } from "@/components/money/EntryForm";
import { FlexBudget } from "@/components/money/FlexBudget";
import { Projects, type Goal } from "@/components/money/Projects";
import { Reports } from "@/components/money/Reports";
import { monthlyReview, reviewText } from "@/lib/money/review";
import { dayPlus, dueOnDay, postJob } from "@/lib/jobs/actions";
import { billsDue, type Bill } from "@/lib/money/bills";
import { flexSummary, type Group, type Kind } from "@/lib/money/flex";
import { cashFlow, foodStats, liveEntries, monthSummary, owedTo, projectProgress, type Entry, type Project } from "@/lib/money/money";
import { shrinkPhoto } from "@/lib/images";
import { supabase } from "@/lib/supabase/client";
import { ruleFor, suggestMatch, type Rule } from "@/lib/money/rules";
import type { Review } from "@/lib/push/money";
import { whatsappHref } from "@/lib/contacts";
import { kes } from "@/lib/shopping/pricing";
import { SHARED_SMS } from "@/lib/shopping/market";
import { syncEngine } from "@/lib/sync/client";
import { useMe, useRows } from "@/lib/sync/hooks";
import type { Row } from "@/lib/sync/tables";
import { correctEntry, flagForMeeting, logMoney, type NewEntry } from "@/lib/sync/workflows";

type Category = Row & Kind & { sort: number };
type Budget = Row & { month: string; category_id: string; amount_kes: number };
type Shop = Row & { name: string };
type Person = Row & { name: string; is_remote?: boolean; phone?: string | null; active?: boolean; sort?: number };
type View = "overview" | "budget" | "entries" | "bills" | "goals" | "reports";
type CardId = "flex" | "settle" | "bills" | "goals" | "recent" | "food" | "flow";

const VIEWS: { id: View; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "budget", label: "Budget" },
  { id: "entries", label: "Entries" },
  { id: "bills", label: "Bills" },
  { id: "goals", label: "Goals" },
  { id: "reports", label: "Reports" },
];
const CARDS: { id: CardId; label: string }[] = [
  { id: "flex", label: "Flexible money left" },
  { id: "settle", label: "Settle up" },
  { id: "bills", label: "Bills this week" },
  { id: "goals", label: "Goals" },
  { id: "recent", label: "Recent entries" },
  { id: "food", label: "Food" },
  { id: "flow", label: "Cash flow" },
];
const HIDDEN_KEY = "money.hiddenCards";

const nairobiToday = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const shift = (m: string, by: number) => {
  const d = new Date(`${m}-15T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};
const monthLabel = (m: string) => new Date(`${m}-15T09:00:00Z`).toLocaleDateString("en-KE", { month: "long", year: "numeric" });
const shortMonth = (m: string) => new Date(`${m}-15T09:00:00Z`).toLocaleDateString("en-KE", { month: "short" });
const day = (d: string) => new Date(`${d}T09:00:00Z`).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" });
const card = "rounded-2xl border border-line bg-raised p-5";

// Money, in the Monarch style. A phone shows one view at a time (Overview, Budget, Entries,
// Bills, Goals) and keeps each one short. A laptop, used to project at the family meeting, shows
// every view at once with the full tables.
export default function MoneyPage() {
  const { syncNow } = useSync();
  const me = useMe();
  const entries = (useRows<Entry & { id: string }>("money_entries") ?? []) as Entry[];
  const projects = (useRows<Goal & { id: string }>("projects") ?? []) as Goal[];
  const categories = (useRows<Category>("budget_categories") ?? []).filter((c) => !c.deleted_at).sort((a, b) => a.sort - b.sort);
  const budgets = useRows<Budget>("budgets") ?? [];
  const people = ((useRows<Person>("members") ?? []) as Person[]).filter((p) => p.active !== false).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const shops = useRows<Shop>("shops") ?? [];
  const reviews = (useRows<Review & { id: string }>("entry_reviews") ?? []) as Review[];
  const rules = (useRows<Rule & { id: string }>("money_rules") ?? []) as Rule[];
  const billRows = useRows<Bill & { id: string }>("bills");
  const bills = useMemo(() => (billRows ?? []) as Bill[], [billRows]);

  const today = nairobiToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [view, setView] = useState<View>("overview");
  const [form, setForm] = useState<Draft | null>(null);
  const [offer, setOffer] = useState<{ match: string; category_id: string | null; bill_id: string | null; shop_id: string | null } | null>(null);
  const [hidden, setHidden] = useState<CardId[]>([]);
  const [editingCards, setEditingCards] = useState(false);
  const [undo, setUndo] = useState<UndoState>(null);
  const closeUndo = useCallback(() => setUndo(null), []);

  // Remembered on this phone only: which overview cards to hide. A #view in the link opens it.
  useEffect(() => {
    try {
      setHidden(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]"));
    } catch {}
    const h = window.location.hash.slice(1) as View;
    if (VIEWS.some((v) => v.id === h)) setView(h);
  }, []);
  function toggleCard(id: CardId) {
    const next = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id];
    setHidden(next);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    } catch {}
  }

  // An M-Pesa message shared into the app (and not for a basket) opens the form, filled in.
  const [sharedSms, setSharedSms] = useState<string | undefined>();
  useEffect(() => {
    try {
      const sms = sessionStorage.getItem(SHARED_SMS);
      if (!sms) return;
      sessionStorage.removeItem(SHARED_SMS);
      setSharedSms(sms);
      setForm({ direction: "out" });
    } catch {}
  }, []);
  useEffect(() => {
    if (!form) setSharedSms(undefined);
  }, [form]);

  // /money?pay=<bill id> (from Home and from bill jobs) opens the form for that bill.
  const [payId, setPayId] = useState<string | null>(null);
  useEffect(() => setPayId(new URLSearchParams(window.location.search).get("pay")), []);
  useEffect(() => {
    const b = payId ? bills.find((x) => x.id === payId) : undefined;
    if (!b) return;
    setForm({ direction: "out", bill_id: b.id, category_id: b.category_id ?? null, note: b.name, amount_kes: b.usual_kes ?? undefined });
    setPayId(null);
    window.history.replaceState(null, "", "/money");
  }, [payId, bills]);

  const s = monthSummary(entries, month);
  const flex = flexSummary(categories, budgets, entries, month, today);
  const flow = cashFlow(entries, month);
  const flowTop = Math.max(1, ...flow.flatMap((f) => [f.moneyIn, f.moneyOut]));
  const food = foodStats(entries, month, today);
  const foodTop = Math.max(1, ...food.trend.map((t) => t.total));
  const live = liveEntries(entries);
  const recent = live.filter((e) => e.occurred_on.startsWith(month)).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)).slice(0, 5);
  const dueSoon = billsDue(bills, entries, today, 7);
  const saving = projects.filter((p) => !p.deleted_at && p.status !== "done");
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Other";
  const nameOf = (id?: string | null) => people.find((p) => p.id === id)?.name ?? "";
  const peter = people.find((p) => p.is_remote);
  // Peter's summary comes from the same review the family sees.
  const summary = reviewText(monthlyReview(month, { entries, kinds: categories, budgets, bills, projects, reviews, nameOf: (id) => nameOf(id) }));
  // Who put money in this month (several people do): by who sent it, else who logged it.
  const sources = [...live.filter((e) => e.direction === "in" && !e.project_id && e.occurred_on.startsWith(month)).reduce((m, e) => {
    const who = e.counterparty || nameOf((e as Entry & { spent_by?: string | null }).spent_by) || "Not given";
    return m.set(who, (m.get(who) ?? 0) + Number(e.amount_kes));
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const owed = owedTo(entries);
  const show = (id: CardId) => !hidden.includes(id);
  const inView = (v: View) => (view === v ? "" : "hidden lg:block");

  async function save(e: NewEntry): Promise<string | null> {
    const r = await logMoney(e);
    if (r.error) return r.error;
    void syncNow();
    setForm(null);
    const extra = [r.funded && `${r.funded} is fully funded`, r.unlocked.length && `money ready for ${r.unlocked.join(", ")}`].filter(Boolean).join(" · ");
    setUndo({ id: Date.now(), message: `${e.direction === "in" ? "+" : "−"}${kes(e.amount_kes)} logged${extra ? ` · ${extra}` : ""}` });
    // A new M-Pesa payee: offer to remember how it was sorted.
    if (e.direction === "out" && e.counterparty && !e.project_id && (e.category_id || e.bill_id) && !ruleFor(e.counterparty, rules)) {
      setOffer({ match: suggestMatch(e.counterparty), category_id: e.category_id ?? null, bill_id: e.bill_id ?? null, shop_id: e.shop_id ?? null });
    }
    return null;
  }

  async function newProject(p: { title: string; kind: Project["kind"]; target_kes: number; notes: string; postJob: boolean; target_date: string | null; emoji: string; planned_monthly_kes: number | null }) {
    let jobId: string | null = null;
    if (p.postJob) {
      jobId = await postJob({ title: p.title, notes: p.notes || null, category: "maintenance_fix", strain: "medium", duration_min: 120, people_needed: 2, due_at: dueOnDay(dayPlus(14)), requires_funds: true, estimated_cost_kes: p.target_kes, planned_for: dayPlus(14) });
    }
    await syncEngine().queue("projects", "insert", { id: crypto.randomUUID(), title: p.title, kind: p.kind, target_kes: p.target_kes, notes: p.notes || null, job_id: jobId, status: "saving", target_date: p.target_date, emoji: p.emoji, planned_monthly_kes: p.planned_monthly_kes });
    void syncNow();
    setUndo({ id: Date.now(), message: `Saving for ${p.title}${jobId ? " · posted on Jobs" : ""}` });
  }

  async function editGoal(p: Goal, changes: Partial<Goal>) {
    await syncEngine().queue("projects", "update", { id: p.id, ...changes });
    void syncNow();
  }

  async function goalPhoto(p: Goal, file: File): Promise<boolean> {
    try {
      const blob = await shrinkPhoto(file);
      const { error } = await supabase().storage.from("family").upload(`goals/${p.id}.jpg`, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      await editGoal(p, { photo_at: new Date().toISOString() });
      setUndo({ id: Date.now(), message: `Photo added to ${p.title}` });
      return true;
    } catch {
      setUndo({ id: Date.now(), message: "That photo didn't upload. Check your signal and try again." });
      return false;
    }
  }

  async function payBack(member: string, amount: number) {
    await save({ direction: "out", amount_kes: amount, occurred_on: today, payback_to: member, method: "mpesa", spent_by: me?.id ?? null, note: `Paid back to ${nameOf(member)}` });
  }

  async function saveBudget(k: Kind, plan: number, group: Group) {
    const m = `${month}-01`;
    const existing = budgets.find((b) => b.category_id === k.id && b.month === m);
    if (existing) await syncEngine().queue("budgets", "update", { id: existing.id, amount_kes: plan });
    else await syncEngine().queue("budgets", "insert", { id: crypto.randomUUID(), month: m, category_id: k.id, amount_kes: plan });
    if (group !== (k.budget_group ?? "flexible")) await syncEngine().queue("budget_categories", "update", { id: k.id, budget_group: group });
    void syncNow();
    setUndo({ id: Date.now(), message: `${k.name}: ${kes(plan)} a month` });
  }

  async function addYearly(name: string, yearly: number) {
    const id = crypto.randomUUID();
    await syncEngine().queue("budget_categories", "insert", { id, name, sort: categories.length + 1, rollover: true, budget_group: "non_monthly" });
    await syncEngine().queue("budgets", "insert", { id: crypto.randomUUID(), month: `${month}-01`, category_id: id, amount_kes: Math.ceil(yearly / 12) });
    void syncNow();
    setUndo({ id: Date.now(), message: `${name}: putting aside ${kes(Math.ceil(yearly / 12))} a month` });
  }

  async function meeting(title: string) {
    const d = await flagForMeeting(title);
    void syncNow();
    setUndo({ id: Date.now(), message: `On the agenda for ${day(d)}` });
  }

  const pay = (b: Bill) => {
    setForm({ direction: "out", bill_id: b.id, category_id: b.category_id ?? null, note: b.name, amount_kes: b.usual_kes ?? undefined });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <Screen title="Money" tone="monarch">
      {/* The month and the one number that matters most. */}
      <section className={`${card} lg:[column-span:all] lg:p-8`}>
        <div className="flex items-center justify-between gap-2">
          <button type="button" aria-label="Previous month" onClick={() => setMonth(shift(month, -1))} className="flex size-11 items-center justify-center rounded-xl text-xl hover:bg-base">
            ‹
          </button>
          <p className="eyebrow eyebrow-accent">{monthLabel(month)}</p>
          <button type="button" aria-label="Next month" disabled={month >= today.slice(0, 7)} onClick={() => setMonth(shift(month, 1))} className="flex size-11 items-center justify-center rounded-xl text-xl hover:bg-base disabled:opacity-30">
            ›
          </button>
        </div>
        <div className="mt-2 lg:flex lg:items-end lg:justify-between lg:gap-8">
          <div>
            <p className="eyebrow">Left this month</p>
            <p className={`font-display text-5xl tabular lg:text-6xl ${s.left < 0 ? "text-out-strong" : ""}`}>{kes(s.left)}</p>
            <p className="mt-1 text-sm text-muted tabular">
              {kes(s.moneyOut)} spent of {kes(s.moneyIn)} in
            </p>
          </div>
          <dl className="mt-4 hidden grid-cols-4 gap-6 text-sm tabular lg:grid">
            <div>
              <dt className="eyebrow">Flexible left</dt>
              <dd className="font-display text-2xl">{flex.flexPlan > 0 ? kes(flex.flexLeft) : "–"}</dd>
            </div>
            <div>
              <dt className="eyebrow">Fixed</dt>
              <dd className="font-display text-2xl">{kes(flex.groups[0].spent)}</dd>
            </div>
            <div>
              <dt className="eyebrow">Kept</dt>
              <dd className="font-display text-2xl">{flow.at(-1)!.keptPct === null ? "–" : `${flow.at(-1)!.keptPct}%`}</dd>
            </div>
            <div>
              <dt className="eyebrow">Bills this week</dt>
              <dd className="font-display text-2xl">{dueSoon.length}</dd>
            </div>
          </dl>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-base" aria-hidden="true">
          <div className={`h-full rounded-full ${s.left < 0 ? "bg-out-strong" : "bg-action"}`} style={{ width: `${s.moneyIn > 0 ? Math.min(100, (s.moneyOut / s.moneyIn) * 100) : s.moneyOut ? 100 : 0}%` }} />
        </div>
        {!form && (
          <div className="mt-4 grid grid-cols-2 gap-2 lg:flex">
            <button type="button" onClick={() => setForm({ direction: "out" })} className="min-h-12 rounded-xl bg-brand px-6 font-bold text-brand-contrast">
              − Money out
            </button>
            <button type="button" onClick={() => setForm({ direction: "in" })} className="min-h-12 rounded-xl border border-ink px-6 font-bold">
              + Money in
            </button>
          </div>
        )}
      </section>

      {form && (
        <div className="lg:[column-span:all]">
          <EntryForm start={form} categories={categories} projects={projects} bills={bills} rules={rules} meId={me?.id} initialSms={sharedSms} onSave={save} onCancel={() => setForm(null)} />
        </div>
      )}

      {/* Phone: one view at a time. */}
      <div role="tablist" aria-label="Money views" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            onClick={() => setView(v.id)}
            className={`min-h-10 shrink-0 rounded-xl px-4 text-sm ${view === v.id ? "bg-ink font-bold text-raised" : "border border-line bg-raised"}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {show("flex") && (
        <section className={`${card} ${inView("overview")}`}>
          <div className="flex items-center gap-5">
            <svg viewBox="0 0 36 36" className="size-24 shrink-0 -rotate-90" aria-hidden="true">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--surface-base)" strokeWidth="3.4" />
              {flex.flexPlan > 0 && flex.flexLeft > 0 && (
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--action)" strokeWidth="3.4" strokeLinecap="round" pathLength="100" strokeDasharray={`${Math.min(100, (flex.flexLeft / flex.flexPlan) * 100)} 100`} />
              )}
            </svg>
            <div className="min-w-0">
              <p className="eyebrow">Flexible money left</p>
              <p className={`font-display text-3xl tabular ${flex.flexLeft < 0 && flex.flexPlan > 0 ? "text-out-strong" : ""}`}>{flex.flexPlan > 0 ? kes(flex.flexLeft) : "Not set yet"}</p>
              <p className="text-sm text-muted">{flex.flexPlan > 0 ? (flex.perDay > 0 ? `About ${kes(flex.perDay)} a day for ${flex.daysLeft} days` : `of ${kes(flex.flexPlan)} for ${monthLabel(month).split(" ")[0]}`) : "Set budgets for Food and Market to see this."}</p>
            </div>
          </div>
          <button type="button" onClick={() => setView("budget")} className="mt-3 min-h-10 text-sm font-bold underline underline-offset-4 lg:hidden">
            See the budget
          </button>
        </section>
      )}

      {show("settle") && owed.length > 0 && (
        <section className={`${card} ${inView("overview")}`}>
          <p className="eyebrow">Settle up</p>
          <p className="text-sm text-muted">Paid for the house from their own money.</p>
          <ul className="mt-2 divide-y divide-line">
            {owed.map((o) => (
              <li key={o.member} className="py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block">{nameOf(o.member) || "Someone"}</span>
                    <span className="text-sm text-muted">
                      {o.items.length === 1 ? `${o.items[0].note || o.items[0].counterparty || "1 payment"}, ${day(o.items[0].occurred_on)}` : `${o.items.length} payments`}
                    </span>
                  </span>
                  <button type="button" onClick={() => void payBack(o.member, o.owed)} className="min-h-10 shrink-0 rounded-xl bg-brand px-4 text-sm font-bold text-brand-contrast tabular">
                    Pay back {kes(o.owed)}
                  </button>
                </div>
                <ul className="mt-1 hidden text-sm text-muted lg:block">
                  {o.items.map((e) => (
                    <li key={e.id} className="flex justify-between gap-2">
                      <span>
                        {day(e.occurred_on)} · {e.note || e.counterparty || catName(e.category_id ?? null)}
                      </span>
                      <span className="tabular">{kes(e.amount_kes)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {show("bills") && (
        <section className={`${card} ${inView("overview")}`}>
          <p className="eyebrow">Bills this week</p>
          {dueSoon.length ? (
            <ul className="mt-2 divide-y divide-line">
              {dueSoon.map(({ bill, stats }) => (
                <li key={bill.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block">{bill.name}</span>
                    <span className={`text-sm ${stats.dueIn! < 0 ? "font-bold text-out-strong" : "text-muted"}`}>
                      {stats.dueIn! < 0 ? `${-stats.dueIn!} days overdue` : stats.dueIn === 0 ? "Due today" : `Due ${day(stats.nextDue!)}`}
                      {stats.last ? ` · last ${kes(stats.last.amount_kes)}` : ""}
                    </span>
                  </span>
                  <button type="button" onClick={() => pay(bill)} className="min-h-10 shrink-0 rounded-xl border border-ink px-4 text-sm font-bold">
                    Pay
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted">Nothing due in the next 7 days.</p>
          )}
        </section>
      )}

      {show("goals") && saving.length > 0 && (
        <section className={`${card} ${inView("overview")}`}>
          <p className="eyebrow">Goals</p>
          <ul className="mt-2 flex flex-col gap-3">
            {saving.slice(0, 3).map((p) => {
              const g = projectProgress(p, entries);
              return (
                <li key={p.id}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span>
                      {p.kind === "upgrade" ? "✨ " : "🔨 "}
                      {p.title}
                    </span>
                    <span className="tabular">{g.pct}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-base">
                    <div className="h-full rounded-full bg-ok-fg" style={{ width: `${g.pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {show("recent") && (
        <section className={`${card} ${view === "overview" ? "" : "hidden"} lg:hidden`}>
          <div className="flex items-baseline justify-between">
            <p className="eyebrow">Recent entries</p>
            <button type="button" onClick={() => setView("entries")} className="min-h-10 text-sm font-bold underline underline-offset-4">
              See all
            </button>
          </div>
          {recent.length ? (
            <ul className="divide-y divide-line">
              {recent.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{e.note || e.counterparty || (e.direction === "in" ? "Money in" : "Spent")}</span>
                    <span className="text-sm text-muted">{day(e.occurred_on)}</span>
                  </span>
                  <span className={`shrink-0 tabular ${e.direction === "in" ? "text-ok-fg" : ""}`}>
                    {e.direction === "in" ? "+" : "−"}
                    {kes(e.amount_kes)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted">Nothing logged for {monthLabel(month)} yet.</p>
          )}
        </section>
      )}

      {show("food") && (
        <section className={`${card} ${inView("overview")}`}>
          <p className="eyebrow">Food</p>
          <div className="mt-1 flex items-end justify-between gap-4">
            <p className="whitespace-nowrap font-display text-3xl tabular">{kes(food.total)}</p>
            <p className="text-sm text-muted tabular">about {kes(food.perWeek)} a week</p>
          </div>
          {food.lastMonth > 0 && (
            <p className="text-sm text-muted">
              {food.total >= food.lastMonth ? `${kes(food.total - food.lastMonth)} more` : `${kes(food.lastMonth - food.total)} less`} than {shortMonth(shift(month, -1))}
            </p>
          )}
          <div className="mt-3 flex h-20 items-end gap-2" role="img" aria-label={`Food spending, last six months: ${food.trend.map((t) => `${monthLabel(t.month)} ${kes(t.total)}`).join(", ")}`}>
            {food.trend.map((t) => (
              <div key={t.month} className="flex flex-1 flex-col items-center gap-1">
                <div className={`w-full rounded-t-[4px] ${t.month === month ? "bg-action" : "bg-line"}`} style={{ height: `${Math.max(2, (t.total / foodTop) * 60)}px` }} />
                <span className="text-xs text-muted">{shortMonth(t.month)}</span>
              </div>
            ))}
          </div>
          {food.byShop.length > 0 && (
            <ul className="mt-3 hidden flex-col gap-1 text-sm lg:flex">
              {food.byShop.map(([id, v]) => (
                <li key={id ?? "none"} className="flex justify-between gap-2">
                  <span>{shops.find((x) => x.id === id)?.name ?? "No shop given"}</span>
                  <span className="tabular">{kes(v)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {show("flow") && (
        <section className={`${card} ${inView("overview")}`}>
          <p className="eyebrow">Cash flow</p>
          <div className="mt-3 flex h-28 items-end gap-2" role="img" aria-label={flow.map((f) => `${monthLabel(f.month)}: in ${kes(f.moneyIn)}, spent ${kes(f.moneyOut)}`).join("; ")}>
            {flow.map((f) => (
              <div key={f.month} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-24 w-full items-end justify-center gap-0.5">
                  <div className="w-1/2 rounded-t-[4px] bg-ok-fg" style={{ height: `${Math.max(2, (f.moneyIn / flowTop) * 96)}px` }} />
                  <div className={`w-1/2 rounded-t-[4px] ${f.month === month ? "bg-action" : "bg-line"}`} style={{ height: `${Math.max(2, (f.moneyOut / flowTop) * 96)}px` }} />
                </div>
                <span className="text-xs text-muted">{shortMonth(f.month)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 flex gap-4 text-xs text-muted">
            <span>
              <span className="mr-1 inline-block size-2.5 rounded-sm bg-ok-fg align-middle" />
              In
            </span>
            <span>
              <span className="mr-1 inline-block size-2.5 rounded-sm bg-action align-middle" />
              Spent
            </span>
          </p>
          {/* Laptop: the numbers behind the bars, and who put money in. */}
          <table className="mt-4 hidden w-full text-sm tabular lg:table">
            <thead>
              <tr className="eyebrow text-left">
                <th className="py-1 font-medium">Month</th>
                <th className="py-1 text-right font-medium">In</th>
                <th className="py-1 text-right font-medium">Spent</th>
                <th className="py-1 text-right font-medium">Kept</th>
              </tr>
            </thead>
            <tbody>
              {flow.map((f) => (
                <tr key={f.month} className="border-t border-line">
                  <td className="py-1.5">{shortMonth(f.month)}</td>
                  <td className="py-1.5 text-right">{kes(f.moneyIn)}</td>
                  <td className="py-1.5 text-right">{kes(f.moneyOut)}</td>
                  <td className={`py-1.5 text-right ${f.kept < 0 ? "text-out-strong" : ""}`}>
                    {kes(f.kept)}
                    {f.keptPct !== null ? ` (${f.keptPct}%)` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sources.length > 0 && (
            <div className="mt-4 hidden lg:block">
              <p className="eyebrow">Money in, {monthLabel(month)}</p>
              <ul className="mt-1 text-sm tabular">
                {sources.map(([who, v]) => (
                  <li key={who} className="flex justify-between border-t border-line py-1.5">
                    <span>{who}</span>
                    <span>{kes(v)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <div className={`flex flex-col gap-2 ${view === "overview" ? "" : "hidden"} lg:flex lg:flex-row lg:items-center lg:justify-between`}>
        <a href={whatsappHref(peter?.phone, summary) ?? `https://wa.me/?text=${encodeURIComponent(summary)}`} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center rounded-xl border border-ink px-5 font-bold">
          Send {monthLabel(month).split(" ")[0]}&apos;s summary to {peter?.name.split(" ")[0] ?? "Peter"}
        </a>
        <button type="button" onClick={() => setEditingCards(true)} className="min-h-10 text-sm text-muted underline underline-offset-4 lg:hidden">
          Choose what shows here
        </button>
      </div>

      {/* Budget */}
      <div className={inView("budget")}>
        <FlexBudget summary={flex} monthName={monthLabel(month).split(" ")[0]} onSave={saveBudget} onAddYearly={addYearly} />
      </div>

      {/* Entries */}
      <div className={inView("entries")}>
        <EntriesView
          entries={entries}
          month={month}
          monthName={monthLabel(month)}
          kinds={categories}
          bills={bills}
          projects={projects}
          people={people}
          reviews={reviews}
          meId={me?.id}
          onAsk={async (e, to, question) => {
            await syncEngine().queue("entry_reviews", "insert", { id: crypto.randomUUID(), entry_id: e.id, ask_to: to, question: question || null, status: "open", answer: null });
            void syncNow();
            setUndo({ id: Date.now(), message: `Question sent${to ? ` to ${nameOf(to)}` : ""}` });
          }}
          onMeeting={(e) => void meeting(`About ${e.note || e.counterparty || "a payment"}: ${kes(e.amount_kes)} on ${day(e.occurred_on)}`)}
          onAnswer={async (r) => {
            await syncEngine().queue("entry_reviews", "update", { id: r.id, status: "ok" });
            void syncNow();
            setUndo({ id: Date.now(), message: "Marked as looked at" });
          }}
          onCorrect={async (e) => {
            await correctEntry(e);
            void syncNow();
            setUndo({ id: Date.now(), message: "Correction logged. The entry no longer counts." });
          }}
        />
      </div>

      {/* Bills */}
      <div className={inView("bills")}>
        <Bills
          bills={bills}
          entries={entries}
          today={today}
          month={month}
          onPay={pay}
          onRemind={async (b, on) => {
            await syncEngine().queue("bills", "update", { id: b.id, remind: on });
            void syncNow();
            setUndo({ id: Date.now(), message: on ? `Reminders on for ${b.name}` : `No reminders for ${b.name}` });
          }}
          onMakeBill={async (r) => {
            const name = r.name.replace(/\(.*?\)/g, "").trim().replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase());
            const billId = crypto.randomUUID();
            await syncEngine().queue("bills", "insert", { id: billId, name, category_id: r.category_id, every_days: 30, usual_kes: r.usual, sort: bills.length + 1 });
            await syncEngine().queue("money_rules", "insert", { id: crypto.randomUUID(), match: r.payee, category_id: r.category_id, bill_id: billId, shop_id: null, sort: rules.length + 1 });
            void syncNow();
            setUndo({ id: Date.now(), message: `${name} is a monthly bill now` });
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
      </div>

      {/* Goals */}
      <div className={inView("goals")}>
        <Projects
          projects={projects}
          entries={entries}
          onNew={newProject}
          onGive={(p) => setForm({ direction: "in", project_id: p.id, note: `For ${p.title}` })}
          onSpend={(p) => setForm({ direction: "out", project_id: p.id, note: p.title })}
          onDone={(p) => syncEngine().queue("projects", "update", { id: p.id, status: "done", done_at: new Date().toISOString() }).then(() => void syncNow())}
          onEdit={editGoal}
          onPhoto={goalPhoto}
          nameOf={nameOf}
          today={today}
        />
      </div>

      {/* Reports */}
      <div className={inView("reports")}>
        <Reports entries={entries} kinds={categories} bills={bills} shops={shops} month={month} nameOf={(id) => nameOf(id)} onOpenReview={() => (window.location.href = "/money/review")} />
      </div>

      {editingCards && (
        <BottomSheet title="Choose what shows on Overview" onClose={() => setEditingCards(false)}>
          <div className="flex flex-col gap-2 pb-2">
            <h2 className="font-display text-2xl">What shows on Overview</h2>
            <p className="text-sm text-muted">Only on this phone. Everyone else keeps their own.</p>
            {CARDS.map((c) => (
              <label key={c.id} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line px-4">
                {c.label}
                <input type="checkbox" checked={show(c.id)} onChange={() => toggleCard(c.id)} className="size-5 accent-[var(--action)]" />
              </label>
            ))}
          </div>
        </BottomSheet>
      )}

      {offer && (
        <BottomSheet title="Remember this payee?" onClose={() => setOffer(null)}>
          <form
            onSubmit={async (ev) => {
              ev.preventDefault();
              if (offer.match.trim().length < 2) return;
              await syncEngine().queue("money_rules", "insert", { id: crypto.randomUUID(), match: offer.match.trim().toUpperCase(), category_id: offer.category_id, bill_id: offer.bill_id, shop_id: offer.shop_id, sort: rules.length + 1 });
              void syncNow();
              setUndo({ id: Date.now(), message: `Next time ${offer.match.trim().toUpperCase()} sorts itself` });
              setOffer(null);
            }}
            className="flex flex-col gap-3 pb-2"
          >
            <h2 className="font-display text-2xl">Remember this payee?</h2>
            <p className="text-sm text-muted">When an M-Pesa message is pasted, it fills in by itself.</p>
            <label className="flex flex-col gap-1 text-sm font-bold">
              When paid to
              <input value={offer.match} onChange={(ev) => setOffer({ ...offer, match: ev.target.value })} className="min-h-12 rounded-xl border border-line bg-raised px-3 font-normal uppercase" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold">
              Kind
              <select value={offer.category_id ?? ""} onChange={(ev) => setOffer({ ...offer, category_id: ev.target.value || null })} className="min-h-12 rounded-xl border border-line bg-raised px-3 font-normal">
                <option value="">Not set</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold">
              Bill
              <select value={offer.bill_id ?? ""} onChange={(ev) => setOffer({ ...offer, bill_id: ev.target.value || null })} className="min-h-12 rounded-xl border border-line bg-raised px-3 font-normal">
                <option value="">Not a bill</option>
                {bills
                  .filter((b) => !b.deleted_at)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button type="submit" className="min-h-12 flex-1 rounded-xl bg-brand font-bold text-brand-contrast">
                Save rule
              </button>
              <button type="button" onClick={() => setOffer(null)} className="min-h-12 rounded-xl px-4 font-bold">
                Not now
              </button>
            </div>
          </form>
        </BottomSheet>
      )}

      <UndoBar state={undo} onClose={closeUndo} />
    </Screen>
  );
}
