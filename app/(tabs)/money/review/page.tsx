"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Screen } from "@/components/Screen";
import { useSync } from "@/components/SyncProvider";
import { UndoBar, type UndoState } from "@/components/UndoBar";
import { whatsappHref } from "@/lib/contacts";
import type { Bill } from "@/lib/money/bills";
import type { Kind } from "@/lib/money/flex";
import type { Budget, Entry, Project } from "@/lib/money/money";
import { monthlyReview, reviewText } from "@/lib/money/review";
import { kes } from "@/lib/shopping/pricing";
import { useRows } from "@/lib/sync/hooks";
import { flagForMeeting } from "@/lib/sync/workflows";

type Person = { id: string; name: string; is_remote?: boolean; phone?: string | null };

const shift = (m: string, by: number) => {
  const d = new Date(`${m}-15T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};
const monthName = (m: string) => new Date(`${m}-15T09:00:00Z`).toLocaleDateString("en-KE", { month: "long" });
const thisMonth = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 7);

// The monthly review: a handful of cards about one month, each true on its own. On a phone they
// swipe one at a time; on a laptop (the family meeting) they all show at once. The same figures
// become Peter's WhatsApp summary.
export default function MonthlyReviewPage() {
  const { syncNow } = useSync();
  const entries = (useRows<Entry & { id: string }>("money_entries") ?? []) as Entry[];
  const kinds = (useRows<Kind & { id: string }>("budget_categories") ?? []) as Kind[];
  const budgets = (useRows<Budget & { id: string }>("budgets") ?? []) as Budget[];
  const bills = (useRows<Bill & { id: string }>("bills") ?? []) as Bill[];
  const projects = (useRows<Project & { id: string }>("projects") ?? []) as Project[];
  const reviews = (useRows<{ id: string; status: string; deleted_at?: string | null }>("entry_reviews") ?? []) as { status: string; deleted_at?: string | null }[];
  const people = (useRows<Person & { updated_at?: string }>("members") ?? []) as Person[];
  const [month, setMonth] = useState(shift(thisMonth(), -1));
  const [at, setAt] = useState(0);
  const [undo, setUndo] = useState<UndoState>(null);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("month");
    if (m && /^\d{4}-\d{2}$/.test(m)) setMonth(m);
  }, []);

  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "";
  const r = monthlyReview(month, { entries, kinds, budgets, bills, projects, reviews, nameOf });
  const peter = people.find((p) => p.is_remote);
  const text = reviewText(r);

  const cards: { id: string; label: string; body: ReactNode }[] = [];
  cards.push({
    id: "flow",
    label: "In and spent",
    body: (
      <>
        <Big>
          {kes(r.moneyIn)} came in, {kes(r.moneyOut)} went out.
        </Big>
        {r.sources.length > 0 && (
          <ul className="text-sm tabular">
            {r.sources.map((s) => (
              <li key={s.label} className="flex justify-between border-t border-line py-1.5">
                <span>{s.label}</span>
                <span>{kes(s.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </>
    ),
  });
  cards.push({
    id: "kept",
    label: "Kept",
    body: r.kept >= 0 ? <Big>{r.keptPct === null ? `${kes(r.kept)} kept.` : `The house kept ${kes(r.kept)}, ${r.keptPct}% of what came in.`}</Big> : <Big>{kes(-r.kept)} more went out than came in.</Big>,
  });
  if (r.topKinds.length)
    cards.push({
      id: "kinds",
      label: "Biggest spending",
      body: (
        <ul className="flex flex-col gap-3">
          {r.topKinds.map((k) => (
            <li key={k.name}>
              <div className="flex justify-between gap-2">
                <span className="font-display text-xl">{k.name}</span>
                <span className="tabular">{kes(k.spent)}</span>
              </div>
              {k.plan > 0 && (
                <>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-base">
                    <div className={`h-full rounded-full ${k.over ? "bg-out-strong" : "bg-action"}`} style={{ width: `${Math.min(100, (k.spent / k.plan) * 100)}%` }} />
                  </div>
                  <p className={`text-xs ${k.over ? "font-bold text-out-strong" : "text-muted"}`}>{k.over ? `${kes(k.spent - k.plan)} over the ${kes(k.plan)} plan` : `of ${kes(k.plan)} planned`}</p>
                </>
              )}
            </li>
          ))}
        </ul>
      ),
    });
  if (r.bills.length)
    cards.push({
      id: "bills",
      label: "Bills and usage",
      body: (
        <ul className="flex flex-col gap-3">
          {r.bills.map((b) => (
            <li key={b.name}>
              <p className="font-display text-xl">
                {b.name}
                {b.change !== null && Math.abs(b.change) >= 15 ? ` was ${Math.abs(b.change)}% ${b.change > 0 ? "above" : "below"} a usual month.` : ""}
              </p>
              <p className="text-sm text-muted tabular">
                {kes(b.paid)}
                {b.used && b.unit ? ` for ${b.used.toLocaleString("en-KE")} ${b.unit}` : ""}
                {b.usual ? ` · usual ${kes(b.usual)}` : ""}
              </p>
            </li>
          ))}
        </ul>
      ),
    });
  if (r.goals.length)
    cards.push({
      id: "goals",
      label: "Goals",
      body: (
        <ul className="flex flex-col gap-3">
          {r.goals.map((g) => (
            <li key={g.title}>
              <p className="font-display text-xl">
                {g.title}: +{kes(g.added)}
              </p>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-base">
                <div className="h-full rounded-full bg-ok-fg" style={{ width: `${g.pct}%` }} />
              </div>
              <p className="text-xs text-muted">
                Now {g.pct}%{g.givers.length ? ` · thanks to ${g.givers.join(", ")}` : ""}
              </p>
            </li>
          ))}
        </ul>
      ),
    });
  if (r.openQuestions || r.owed.length)
    cards.push({
      id: "loose",
      label: "To sort out",
      body: (
        <div className="flex flex-col gap-2">
          {r.openQuestions > 0 && <Big>{r.openQuestions === 1 ? "1 question about a payment is still open." : `${r.openQuestions} questions about payments are still open.`}</Big>}
          {r.owed.map((o) => (
            <p key={o.name} className="tabular">
              The house owes {o.name} {kes(o.amount)}.
            </p>
          ))}
        </div>
      ),
    });

  function onScroll() {
    const el = strip.current;
    if (!el) return;
    setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth * 0.86)));
  }

  return (
    <Screen title={`${monthName(month)} review`} back="/money" tone="monarch">
      <div className="flex items-center justify-between gap-2">
        <button type="button" aria-label="Previous month" onClick={() => setMonth(shift(month, -1))} className="flex size-11 items-center justify-center rounded-xl text-xl hover:bg-raised">
          ‹
        </button>
        <p className="eyebrow eyebrow-accent">
          {monthName(month)} {month.slice(0, 4)}
        </p>
        <button type="button" aria-label="Next month" disabled={month >= thisMonth()} onClick={() => setMonth(shift(month, 1))} className="flex size-11 items-center justify-center rounded-xl text-xl hover:bg-raised disabled:opacity-30">
          ›
        </button>
      </div>

      {/* Phone: one card at a time, swiped. Laptop: every card at once. */}
      <div ref={strip} onScroll={onScroll} className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
        {cards.map((c, i) => (
          <section key={c.id} aria-label={c.label} className="flex min-h-[22rem] w-[86%] shrink-0 snap-center flex-col gap-4 rounded-2xl border border-line bg-raised p-6 lg:min-h-0 lg:w-auto">
            <p className="eyebrow">
              {c.label} <span className="text-muted lg:hidden">· {i + 1} of {cards.length}</span>
            </p>
            {c.body}
          </section>
        ))}
      </div>
      <div className="flex justify-center gap-1.5 lg:hidden" aria-hidden="true">
        {cards.map((c, i) => (
          <span key={c.id} className={`h-1.5 rounded-full ${i === at ? "w-5 bg-action" : "w-1.5 bg-line"}`} />
        ))}
      </div>

      <div className="flex flex-col gap-2 lg:flex-row">
        <a href={whatsappHref(peter?.phone, text) ?? `https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center rounded-xl bg-brand px-6 font-bold text-brand-contrast">
          Send to {peter?.name.split(" ")[0] ?? "Peter"} on WhatsApp
        </a>
        <button
          type="button"
          onClick={async () => {
            const d = await flagForMeeting(`Money review: ${monthName(month)} ${month.slice(0, 4)}`, null, "money_review");
            void syncNow();
            setUndo({ id: Date.now(), message: `On the agenda for ${new Date(`${d}T09:00:00Z`).toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "short" })}` });
          }}
          className="min-h-12 rounded-xl border border-ink px-6 font-bold"
        >
          Put on the meeting agenda
        </button>
      </div>
      <UndoBar state={undo} onClose={() => setUndo(null)} />
    </Screen>
  );
}

function Big({ children }: { children: ReactNode }) {
  return <p className="font-display text-3xl leading-tight">{children}</p>;
}
