"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useSync } from "@/components/SyncProvider";
import { isActive, type Trip } from "@/components/shop/TripCheck";
import { essentialsNeeded, nairobiToday, supperCount, type Diner } from "@/lib/home";
import { fromTemplate, joinJob, postJob, updateJob } from "@/lib/jobs/actions";
import { formatMinutes, jobStatus, shareChoices, sortBoard, workers, type Job, type Participant } from "@/lib/jobs/logic";
import { TEMPLATES } from "@/lib/jobs/templates";
import { sendAlertsNow } from "@/lib/push/client";
import { kes, linePrice, stockStatus, type CatalogMatch, type StockLike } from "@/lib/shopping/pricing";
import type { Shop, StockItem } from "@/lib/shopping/shops";
import { localDB, syncEngine } from "@/lib/sync/client";
import { useMe, useRows } from "@/lib/sync/hooks";

const card = "rounded-xl bg-raised p-4 shadow-[0_1px_3px_rgba(10,51,35,.10)]";
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
      <span className="rounded-full bg-raised px-3 py-1.5 font-bold">
        🏠 {c.eating}/{c.total} home for supper{c.out.length ? ` (${c.out.join(", ")} out)` : ""}
      </span>
      <button type="button" aria-pressed={outTonight} onClick={toggle} className="min-h-10 rounded-full border border-line px-3 font-bold text-brand">
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
        <section key={j.id} className="rounded-xl bg-brand p-4 text-brand-contrast">
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
            className="mt-2 min-h-12 rounded-xl bg-raised px-4 font-bold text-brand disabled:opacity-60"
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
    await postJob(fromTemplate(t));
    void syncNow().then((r) => {
      if (r?.ok && t.urgent) void sendAlertsNow();
    });
    setDone(`Posted: ${t.title}`);
  };
  const chip = "flex min-h-12 shrink-0 items-center rounded-full border border-brand bg-raised px-4 text-sm font-bold text-brand";
  return (
    <section aria-label="What's needed">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
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
  const concepts = [...new Set(needed.map((s) => s.canonical_concept).filter((c): c is string => !!c))];
  const matches = (useLiveQuery(() => (concepts.length ? localDB().catalog.where("canonical_concept").anyOf(concepts).toArray() : []), [concepts.join("|")], []) ?? []) as unknown as CatalogMatch[];
  if (!needed.length) return null;
  const live = matches.filter((m) => (m as { in_stock?: boolean }).in_stock !== false);
  const price = (s: StockLike) => linePrice({ id: s.id, title: s.name, item: s }, live);
  const total = needed.reduce((sum, s) => sum + (price(s) ?? 0), 0);

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
