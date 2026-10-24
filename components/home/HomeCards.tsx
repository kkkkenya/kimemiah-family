"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useSync } from "@/components/SyncProvider";
import { isActive, type Trip } from "@/components/shop/TripCheck";
import { essentialsNeeded, nairobiToday, supperCount, type Diner } from "@/lib/home";
import { fromTemplate, joinJob, postJob, updateJob } from "@/lib/jobs/actions";
import { billStats, billsDue, type Bill } from "@/lib/money/bills";
import { findDuplicate } from "@/lib/jobs/board";
import { flexSummary, type Kind } from "@/lib/money/flex";
import { chippedIn, monthSummary, type Budget, type Entry, type Project } from "@/lib/money/money";
import { formatMinutes, jobStatus, shareChoices, sortBoard, workers, type Job, type Participant } from "@/lib/jobs/logic";
import { TEMPLATES } from "@/lib/jobs/templates";
import { sendAlertsNow } from "@/lib/push/client";
import { kes, linePrice, moneyLeftThisMonth, stockStatus, type CatalogMatch, type MoneyEntry, type StockLike } from "@/lib/shopping/pricing";
import type { Shop, StockItem } from "@/lib/shopping/shops";
import { upgradeDeals } from "@/lib/shopping/predict";
import { localDB, syncEngine } from "@/lib/sync/client";
import { useMe, useRows } from "@/lib/sync/hooks";

const card = "rounded-2xl bg-raised p-4 border border-line";
const when = (iso: string) => new Date(iso).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });

type Me = Diner & { no_heavy?: boolean };

function useJobs() {
  const jobs = ((useRows<Job & { id: string }>("jobs") ?? []) as Job[]).filter((j) => !j.deleted_at);
  const parts = (useRows<Participant & { id: string }>("job_participants") ?? []) as Participant[];
  return { jobs, parts };
}

/** "🏠 4/5 home for supper" with a one-tap "I'll be out tonight" (resets each day). */
export function SupperPill() {
  const { syncNow } = useSync();
  const me = useMe() as Me | undefined;
  const people = (useRows<Diner & { id: string }>("members") ?? []) as Diner[];
  if (!me || me.is_remote) return null;
  const c = supperCount(people);
  const outTonight = me.eating_out_on === nairobiToday();
  const toggle = async () => {
    await syncEngine().queue("members", "update", { id: me.id, eating_out_on: outTonight ? null : nairobiToday() });
    void syncNow();
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="rounded-md bg-raised px-3 py-1.5 font-bold">
        🏠 {c.eating}/{c.total} home for supper{c.out.length ? ` (${c.out.join(", ")} out)` : ""}
      </span>
      <button type="button" aria-pressed={outTonight} onClick={toggle} className="min-h-10 rounded-md border border-line px-3 font-bold text-brand">
        {outTonight ? "I'll be home after all" : "I'll be out tonight"}
      </button>
    </div>
  );
}

/** Urgent jobs ("Water is back!") and who's out shopping right now. */
export function LiveBanners() {
  const { online, syncNow } = useSync();
  const me = useMe();
  const { jobs, parts } = useJobs();
  const trips = (useRows<Trip & { id: string }>("shopping_trips") ?? []) as Trip[];
  const shops = useRows<Shop>("shops") ?? [];
  const people = useRows<Diner & { id: string }>("members") ?? [];
  const [msg, setMsg] = useState<string | null>(null);
  const urgent = jobs.filter((j) => j.urgent && !j.done_at && ["open", "partial"].includes(jobStatus(j, parts)) && !workers(j.id, parts).some((p) => p.member_id === me?.id));
  const shopping = trips.filter((t) => isActive(t) && t.member_id !== me?.id);
  if (!urgent.length && !shopping.length && !msg) return null;
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? "Someone";

  return (
    <div className="flex flex-col gap-2">
      {urgent.map((j) => (
        <section key={j.id} className="rounded-2xl bg-[#1a1919] p-5 text-white">
          <p className="font-bold">{j.category === "water_tanks" ? "💧 " : "⚡ "}{j.title}</p>
          <button
            type="button"
            disabled={!online}
            onClick={async () => {
              const pct = shareChoices(j, parts, me?.id).suggested;
              const err = pct ? await joinJob(j.id, pct) : "It's already covered.";
              setMsg(err ?? `You're on it. Asante!`);
              void syncNow();
            }}
            className="mt-3 min-h-12 rounded-xl bg-action px-5 text-action-ink disabled:opacity-60"
          >
            {online ? "I'm on it" : "Needs signal"}
          </button>
        </section>
      ))}
      {shopping.map((t) => (
        <Link key={t.id} href="/shop" className="block rounded-xl bg-ok-bg px-4 py-3 text-ok-fg">
          🛒 <strong>{nameOf(t.member_id)}</strong> is at {shops.find((s) => s.id === t.shop_id)?.name ?? "the shops"}. Add anything you need to the list ›
        </Link>
      ))}
      {msg && <p className="text-sm text-muted">{msg}</p>}
    </div>
  );
}

/** Jobs I'm on today: my share, the next reminder, and Done in one tap. */
export function MyJobs() {
  const { syncNow } = useSync();
  const me = useMe();
  const { jobs, parts } = useJobs();
  const mine = jobs.filter((j) => !j.done_at && workers(j.id, parts).some((p) => p.member_id === me?.id));
  if (!mine.length) return null;
  return (
    <section aria-labelledby="my-jobs" className={card}>
      <h2 id="my-jobs" className="font-bold">
        Your jobs
      </h2>
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {mine.map((j) => {
          const p = workers(j.id, parts).find((w) => w.member_id === me?.id)!;
          const next = Date.parse(p.created_at ?? "") + Math.ceil((Date.now() - Date.parse(p.created_at ?? "")) / 7_200_000) * 7_200_000;
          return (
            <li key={j.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="block font-bold">{j.title}</span>
                <span className="text-sm text-muted">
                  Your {p.effort_pct}%{Number.isFinite(next) ? ` · next reminder ${when(new Date(next).toISOString())}` : ""}
                </span>
              </span>
              <button
                type="button"
                onClick={() => updateJob(j.id, { done_at: new Date().toISOString(), done_by: me?.id ?? null }).then(() => void syncNow())}
                className="min-h-12 shrink-0 rounded-xl bg-brand px-4 font-bold text-brand-contrast"
              >
                ✓ Done
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** One-tap "what's needed": the usual urgent jobs, plus shortcuts to Stock, receipts and Asante. */
export function QuickStrip() {
  const { syncNow } = useSync();
  const [done, setDone] = useState<string | null>(null);
  const post = async (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    const open = (await localDB().rows("jobs").toArray()) as unknown as Job[];
    if (findDuplicate({ title: t.title, template_key: t.id }, open)) return setDone(`Already on the board: ${t.title}. Join it in Jobs.`);
    await postJob(fromTemplate(t));
    void syncNow().then((r) => {
      if (r?.ok && t.urgent) void sendAlertsNow();
    });
    setDone(`Posted: ${t.title}`);
  };
  const chip = "flex min-h-12 shrink-0 items-center rounded-md border border-brand bg-raised px-4 text-sm font-bold text-brand";
  return (
    <section aria-label="What's needed">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0">
        <button type="button" onClick={() => post("water")} className={chip}>💧 Water is back</button>
        <button type="button" onClick={() => post("arrange")} className={chip}>🍲 Arrange kitchen (light)</button>
        <button type="button" onClick={() => post("dishes")} className={chip}>🍽️ Wash dishes</button>
        <Link href="/stock" className={chip}>🥛 Mark something out</Link>
        <Link href="/stock?receipt=1" className={chip}>🧾 Read a receipt</Link>
        <Link href="/jobs?tab=done" className={chip}>🙏 Say asante</Link>
      </div>
      {done && <p className="mt-1 text-sm text-muted">{done}</p>}
    </section>
  );
}

/** Essentials that are Out or Low, each with its Quickmart price, and the total. */
export function EssentialsCard() {
  const stock = ((useRows<StockItem>("stock_items") ?? []) as (StockItem & StockLike)[]).filter((s) => !s.deleted_at);
  const needed = essentialsNeeded(stock);
  const money = (useRows<MoneyEntry & { id: string }>("money_entries") ?? []) as MoneyEntry[];
  const concepts = [...new Set(needed.map((s) => s.canonical_concept).filter((c): c is string => !!c))];
  const matches = (useLiveQuery(() => (concepts.length ? localDB().catalog.where("canonical_concept").anyOf(concepts).toArray() : []), [concepts.join("|")], []) ?? []) as unknown as CatalogMatch[];
  if (!needed.length) return null;
  const live = matches.filter((m) => (m as { in_stock?: boolean }).in_stock !== false);
  const price = (s: StockLike) => linePrice({ id: s.id, title: s.name, item: s }, live);
  const total = needed.reduce((sum, s) => sum + (price(s) ?? 0), 0);
  const moneyLeft = moneyLeftThisMonth(money);

  return (
    <section aria-labelledby="essentials" className={card}>
      <h2 id="essentials" className="font-display text-xl">
        Essentials needed now
      </h2>
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {needed.map((s) => {
          const out = stockStatus(s) === "out";
          const p = price(s);
          return (
            <li key={s.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className={`mr-2 rounded-md px-1.5 text-xs font-bold ${out ? "bg-out-bg text-out-fg" : "bg-low-bg text-low-fg"}`}>
                  {out ? "✕ Out" : "! Low"}
                </span>
                {s.name}
              </span>
              <span className="shrink-0 text-sm tabular">{p != null ? kes(p) : "–"}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 font-bold tabular">About {kes(total)} at Quickmart prices</p>
      {moneyLeft != null && <p className={`text-sm tabular ${moneyLeft < total ? "text-low-fg" : "text-muted"}`}>Money left this month: {kes(moneyLeft)}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/shop?view=list" className="flex min-h-12 items-center rounded-xl bg-brand px-4 font-bold text-brand-contrast">
          🛒 Open the cart
        </Link>
        <Link href="/shop?view=list" className="flex min-h-12 items-center rounded-xl border border-brand px-4 font-bold text-brand">
          🏃 Quick supermarket top-up
        </Link>
      </div>
    </section>
  );
}

/** The top open jobs that need people (Light first for anyone with "No heavy jobs" on). */
export function OpenJobsCard() {
  const me = useMe() as Me | undefined;
  const { jobs, parts } = useJobs();
  let open = sortBoard(
    jobs.filter((j) => ["open", "partial", "overdue"].includes(jobStatus(j, parts)) && !workers(j.id, parts).some((p) => p.member_id === me?.id)),
    parts,
  );
  if (me?.no_heavy) open = open.filter((j) => j.strain !== "heavy").sort((a, b) => Number(b.strain === "light") - Number(a.strain === "light"));
  if (!open.length) return null;
  return (
    <section aria-labelledby="open-jobs" className={card}>
      <h2 id="open-jobs" className="font-bold">
        Jobs needing people
      </h2>
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {open.slice(0, 3).map((j) => (
          <li key={j.id} className="py-2">
            <span className="block font-bold">{j.title}</span>
            <span className="text-sm text-muted">
              {formatMinutes(j.duration_min)} × {j.people_needed === 1 ? "1 person" : `${j.people_needed} people`} · {j.strain}
            </span>
          </li>
        ))}
      </ul>
      <Link href="/jobs" className="mt-2 inline-flex min-h-12 items-center rounded-xl bg-brand px-4 font-bold text-brand-contrast">
        Open Jobs
      </Link>
    </section>
  );
}

/** For Peter (lives away): money runs coming up and bills to pay, first. */
export function PeterCard() {
  const me = useMe() as Me | undefined;
  const { jobs, parts } = useJobs();
  if (!me?.is_remote) return null;
  const runs = jobs.filter((j) => j.requires_funds && !j.done_at && jobStatus(j, parts) === "planning");
  const bills = jobs.filter((j) => j.category === "utilities_dad" && !j.done_at);
  return (
    <section aria-labelledby="for-peter" className={card}>
      <h2 id="for-peter" className="font-display text-xl">
        Coming up
      </h2>
      {!runs.length && !bills.length && <p className="text-muted">No money runs or bills waiting.</p>}
      {[...bills, ...runs].map((j) => (
        <p key={j.id} className="mt-2">
          <strong>{j.title}</strong>
          <span className="block text-sm text-muted">
            {j.planned_for ? `Planned for ${j.planned_for}` : "Bill to pay"}
            {j.estimated_cost_kes ? ` · about ${kes(j.estimated_cost_kes)}` : ""}
            {j.funds_status === "funds_ready" ? " · money ready" : j.requires_funds ? " · money still being arranged" : ""}
          </span>
        </p>
      ))}
    </section>
  );
}

/** Can-wait upgrades on the list with a 12%+ deal this week: the week to buy them. */
export function UpgradeDealsCard() {
  const extras = (useRows<{ id: string; title: string; shopping_tier?: string; catalog_product_id?: string | null; item_id?: string | null; bought_at?: string | null }>("shopping_extras") ?? []).filter(
    (e) => e.shopping_tier === "qol" && !e.bought_at,
  );
  const stock = useRows<StockItem>("stock_items") ?? [];
  const concepts = [...new Set(extras.map((e) => stock.find((s) => s.id === e.item_id)?.canonical_concept).filter((c): c is string => !!c))];
  const ids = extras.map((e) => e.catalog_product_id).filter((x): x is string => !!x);
  const products = (useLiveQuery(
    async () => [
      ...(concepts.length ? await localDB().catalog.where("canonical_concept").anyOf(concepts).toArray() : []),
      ...(ids.length ? await localDB().catalog.bulkGet(ids) : []).filter(Boolean),
    ],
    [concepts.join("|"), ids.join("|")],
    [],
  ) ?? []) as unknown as CatalogMatch[];
  const deals = upgradeDeals(
    extras.map((e) => ({ ...e, concept: stock.find((s) => s.id === e.item_id)?.canonical_concept ?? null })),
    products,
  );
  if (!deals.length) return null;
  return (
    <Link href="/shop?view=list" className="block rounded-xl bg-ok-bg px-4 py-3 text-ok-fg">
      ✨ <strong>Upgrade on sale this week:</strong> {deals.map((d) => `${d.line.title} (−${Math.round(d.deal.discount_pct)}%)`).join(", ")} ›
    </Link>
  );
}

const TIPS: Record<string, string> = {
  water: "Shorter showers, a full load in the machine, and a look for dripping taps all help.",
  gas: "Lids on pots, soaking beans first, and turning the flame down once it boils all help.",
};

/** Bills due in the next few days (or overdue), and any bill running well above a usual month. */
export function BillsDueCard() {
  const bills = (useRows<Bill & { id: string }>("bills") ?? []) as Bill[];
  const entries = (useRows<Entry & { id: string }>("money_entries") ?? []) as Entry[];
  const today = nairobiToday();
  const due = billsDue(bills, entries, today);
  // About the house, never a person: what's being used, and what helps.
  const heavy = bills
    .filter((b) => !b.deleted_at)
    .map((bill) => ({ bill, stats: billStats(bill, entries, today) }))
    .filter((x) => x.stats.change !== null && x.stats.change >= 25);
  if (!due.length && !heavy.length) return null;
  return (
    <section className="rounded-2xl border border-line bg-raised p-5">
      <h2 className="font-display text-xl">Bills</h2>
      {due.length > 0 && (
        <ul className="mt-2 flex flex-col divide-y divide-line">
          {due.map(({ bill, stats }) => (
            <li key={bill.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                <span className="block font-bold">{bill.name}</span>
                <span className={`text-sm ${stats.dueIn! < 0 ? "font-bold text-out-strong" : "text-muted"}`}>
                  {stats.dueIn! < 0 ? `${-stats.dueIn!} days overdue` : stats.dueIn === 0 ? "Due today" : `Due in ${stats.dueIn} days`}
                  {stats.last ? ` · last ${kes(stats.last.amount_kes)}` : ""}
                </span>
              </span>
              <Link href={`/money?pay=${bill.id}`} className="flex min-h-12 shrink-0 items-center rounded-xl border border-line px-4 font-bold">
                Paid it
              </Link>
            </li>
          ))}
        </ul>
      )}
      {heavy.map(({ bill, stats }) => (
        <p key={bill.id} className="mt-2 rounded-xl bg-low-bg px-3 py-2 text-sm text-low-fg">
          <strong>{bill.name} this month: {stats.change}% more than usual</strong> ({kes(stats.thisMonth)} against about {kes(stats.usualMonth!)}).{" "}
          {TIPS[Object.keys(TIPS).find((k) => bill.name.toLowerCase().includes(k)) ?? ""] ?? "Worth a word at the next meeting."}
        </p>
      ))}
    </section>
  );
}

/** The month at a glance (Monarch look, like Money): what's left, and flexible money a day. */
export function MoneyGlanceCard() {
  const entries = (useRows<Entry & { id: string }>("money_entries") ?? []) as Entry[];
  const kinds = (useRows<Kind & { id: string }>("budget_categories") ?? []) as Kind[];
  const budgets = (useRows<Budget & { id: string }>("budgets") ?? []) as Budget[];
  const today = nairobiToday();
  const s = monthSummary(entries, today.slice(0, 7));
  const flex = flexSummary(kinds, budgets, entries, today.slice(0, 7), today);
  if (!s.moneyIn && !s.moneyOut) return null;
  return (
    <Link href="/money" className="block rounded-2xl border border-line bg-raised p-5">
      <p className="eyebrow eyebrow-accent">Money this month</p>
      <p className={`font-display text-4xl tabular ${s.left < 0 ? "text-out-strong" : ""}`}>{kes(s.left)}</p>
      <p className="text-sm text-muted tabular">
        left · {kes(s.moneyOut)} spent of {kes(s.moneyIn)}
      </p>
      {flex.flexPlan > 0 && (
        <p className="mt-2 text-sm">
          Flexible: <strong>{kes(flex.flexLeft)}</strong>
          {flex.perDay > 0 ? `, about ${kes(flex.perDay)} a day` : ""}
        </p>
      )}
    </Link>
  );
}

/** A goal finished in the last 3 days: a thank-you to everyone who chipped in, in the order they gave. */
export function GoalThanksCard() {
  const projects = (useRows<Project & { id: string; done_at?: string | null; emoji?: string | null }>("projects") ?? []) as (Project & { done_at?: string | null; emoji?: string | null })[];
  const entries = (useRows<Entry & { id: string }>("money_entries") ?? []) as Entry[];
  const people = useRows<{ id: string; name: string }>("members") ?? [];
  const recent = projects.filter((p) => !p.deleted_at && p.status === "done" && p.done_at && Date.now() - Date.parse(p.done_at) < 3 * 86_400_000);
  if (!recent.length) return null;
  const nameOf = (id: string) => people.find((m) => m.id === id)?.name ?? "";
  return (
    <>
      {recent.map((p) => {
        const givers = chippedIn(p, entries, nameOf);
        return (
          <div key={p.id} className="rounded-2xl border border-line bg-raised p-5">
            <p className="eyebrow eyebrow-accent">Goal reached</p>
            <p className="font-display text-2xl">
              {p.emoji || "🎉"} {p.title} is done
            </p>
            {givers.length > 0 && <p className="mt-1 text-sm">Asante to {givers.length === 1 ? givers[0] : `${givers.slice(0, -1).join(", ")} and ${givers.at(-1)}`} for chipping in.</p>}
          </div>
        );
      })}
    </>
  );
}

/** From the 1st to the 7th: last month's money review is ready (and feeds the meeting). */
export function ReviewReadyCard() {
  const today = nairobiToday();
  if (Number(today.slice(8, 10)) > 7) return null;
  const d = new Date(`${today.slice(0, 7)}-15T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const last = d.toISOString().slice(0, 7);
  const name = new Date(`${last}-15T09:00:00Z`).toLocaleDateString("en-KE", { month: "long" });
  return (
    <Link href={`/money/review?month=${last}`} className="block rounded-2xl border border-line bg-raised p-5">
      <p className="eyebrow eyebrow-accent">Monthly review</p>
      <p className="font-display text-2xl">{name}&apos;s money review is ready</p>
      <p className="text-sm text-muted">A few cards to go through at the meeting, and send to Peter.</p>
    </Link>
  );
}
