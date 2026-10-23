"use client";

import { useMemo, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { liveEntries, type Entry, type Project } from "@/lib/money/money";
import type { Bill } from "@/lib/money/bills";
import type { Review } from "@/lib/push/money";
import { kes } from "@/lib/shopping/pricing";

type Person = { id: string; name: string };
type Named = { id: string; name: string };
type Full = Entry & { spent_by?: string | null; method?: string | null; shop_id?: string | null; created_at?: string };
type Filter = "all" | "review" | "in" | "out";

const day = (d: string) => new Date(`${d}T09:00:00Z`).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" });
const METHOD: Record<string, string> = { mpesa: "M-Pesa", cash: "Cash", bank: "Bank", other: "Other" };

// Every entry for the month: search (payee, note, M-Pesa code, amount), filters, and questions.
// A phone gets a list grouped by day with a detail sheet; a laptop gets the full table.
export function EntriesView({
  entries,
  month,
  monthName,
  kinds,
  bills,
  projects,
  people,
  reviews,
  meId,
  onAsk,
  onMeeting,
  onAnswer,
  onCorrect,
}: {
  entries: Entry[];
  month: string;
  monthName: string;
  kinds: Named[];
  bills: Bill[];
  projects: Project[];
  people: Person[];
  reviews: Review[];
  meId?: string;
  onAsk: (e: Entry, to: string | null, question: string) => void;
  onMeeting: (e: Entry) => void;
  onAnswer: (r: Review) => void;
  onCorrect: (e: Entry) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [kindId, setKindId] = useState("");
  const [open, setOpen] = useState<Full | null>(null);

  const openReviews = useMemo(() => reviews.filter((r) => !r.deleted_at && r.status === "open"), [reviews]);
  const reviewOf = (id: string) => openReviews.find((r) => r.entry_id === id);
  const nameOf = (id?: string | null) => people.find((p) => p.id === id)?.name ?? "";
  const kindOf = (e: Entry) => {
    if (e.payback_to) return `Paid back to ${nameOf(e.payback_to)}`;
    if (e.paid_from === "own") return `${kinds.find((k) => k.id === e.category_id)?.name ?? "Not sorted"} · own money`;
    const p = projects.find((x) => x.id === e.project_id);
    if (p) return `${p.kind === "upgrade" ? "✨" : "🔨"} ${p.title}`;
    const b = bills.find((x) => x.id === e.bill_id);
    if (b) return b.name;
    return e.direction === "in" ? "The house" : (kinds.find((k) => k.id === e.category_id)?.name ?? "Not sorted");
  };
  const title = (e: Entry) => e.note || e.counterparty || (e.direction === "in" ? "Money in" : "Spent");

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (liveEntries(entries) as Full[])
    .filter((e) => e.occurred_on.startsWith(month))
    .filter((e) => (filter === "review" ? !!reviewOf(e.id) : filter === "all" ? true : e.direction === filter))
    .filter((e) => !kindId || e.category_id === kindId)
    .filter((e) => {
      if (!words.length) return true;
      const hay = `${title(e)} ${e.counterparty ?? ""} ${e.mpesa_code ?? ""} ${kindOf(e)} ${nameOf(e.spent_by)} ${Math.round(Number(e.amount_kes))}`.toLowerCase();
      return words.every((w) => hay.includes(w.replace(/,/g, "")));
    })
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const days = [...new Set(shown.map((e) => e.occurred_on))];
  const needs = liveEntries(entries).filter((e) => e.occurred_on.startsWith(month) && reviewOf(e.id)).length;

  const controls = (
    <div className="flex flex-col gap-2">
      <label className="sr-only" htmlFor="entry-search">
        Search entries
      </label>
      <input id="entry-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search payee, note, M-Pesa code, amount" className="min-h-12 w-full rounded-xl border border-line bg-raised px-4" />
      <div className="flex flex-wrap gap-2 text-sm">
        {(
          [
            ["all", "All"],
            ["review", `Needs a look${needs ? ` · ${needs}` : ""}`],
            ["out", "Spent"],
            ["in", "Money in"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={`min-h-10 rounded-xl border px-4 ${filter === id ? "border-ink bg-ink text-raised" : "border-line bg-raised"}`}>
            {label}
          </button>
        ))}
        <select aria-label="Kind" value={kindId} onChange={(e) => setKindId(e.target.value)} className="min-h-10 rounded-xl border border-line bg-raised px-3">
          <option value="">Every kind</option>
          {kinds.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <>
      <section id="entries" className="flex flex-col gap-3 lg:hidden">
        {controls}
        {days.map((d) => (
          <div key={d} className="rounded-2xl border border-line bg-raised px-4">
            <p className="eyebrow pb-1 pt-3">{day(d)}</p>
            <ul className="divide-y divide-line">
              {shown
                .filter((e) => e.occurred_on === d)
                .map((e) => {
                  const r = reviewOf(e.id);
                  return (
                    <li key={e.id}>
                      <button type="button" onClick={() => setOpen(e)} className="flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left">
                        <span className="min-w-0">
                          <span className="block truncate">{title(e)}</span>
                          <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
                            {kindOf(e)}
                            {e.spent_by ? ` · ${nameOf(e.spent_by)}` : ""}
                            {r && <span className="rounded-md bg-low-bg px-2 text-xs font-bold text-low-fg">{r.ask_to ? `Ask ${nameOf(r.ask_to)}` : "Needs a look"}</span>}
                          </span>
                        </span>
                        <span className={`shrink-0 tabular ${e.direction === "in" ? "text-ok-fg" : ""}`}>
                          {e.direction === "in" ? "+" : "−"}
                          {kes(e.amount_kes)}
                        </span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
        {!shown.length && <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-muted">{words.length || filter !== "all" || kindId ? "Nothing matches. Try fewer words or another filter." : `Nothing logged for ${monthName} yet.`}</p>}
      </section>

      {/* Laptop: every column, for going through the month together. */}
      <div className="hidden rounded-2xl border border-line bg-raised p-6 lg:block">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl">Entries, {monthName}</h2>
          <span className="text-sm text-muted tabular">
            {shown.length} shown · out {kes(shown.filter((e) => e.direction === "out").reduce((s, e) => s + Number(e.amount_kes), 0))} · in {kes(shown.filter((e) => e.direction === "in").reduce((s, e) => s + Number(e.amount_kes), 0))}
          </span>
        </div>
        {controls}
        <table className="mt-4 w-full text-sm tabular">
          <thead>
            <tr className="eyebrow text-left">
              <th className="py-2 font-medium">Day</th>
              <th className="py-2 font-medium">What</th>
              <th className="py-2 font-medium">Kind</th>
              <th className="py-2 font-medium">Who</th>
              <th className="py-2 font-medium">How</th>
              <th className="py-2 font-medium">M-Pesa code</th>
              <th className="py-2 text-right font-medium">Usage</th>
              <th className="py-2 text-right font-medium">Amount</th>
              <th className="py-2 pl-4 font-medium">Question</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => {
              const r = reviewOf(e.id);
              const bill = bills.find((b) => b.id === e.bill_id);
              return (
                <tr key={e.id} onClick={() => setOpen(e)} className="cursor-pointer border-t border-line hover:bg-base">
                  <td className="whitespace-nowrap py-2 text-muted">{day(e.occurred_on)}</td>
                  <td className="py-2">{title(e)}</td>
                  <td className="py-2">{kindOf(e)}</td>
                  <td className="py-2">{nameOf(e.spent_by)}</td>
                  <td className="py-2 text-muted">{METHOD[e.method ?? ""] ?? ""}</td>
                  <td className="py-2 font-mono text-xs text-muted">{e.mpesa_code ?? ""}</td>
                  <td className="py-2 text-right text-muted">{e.usage_qty && bill?.usage_unit ? `${e.usage_qty} ${bill.usage_unit}` : ""}</td>
                  <td className={`whitespace-nowrap py-2 text-right ${e.direction === "in" ? "text-ok-fg" : ""}`}>
                    {e.direction === "in" ? "+" : "−"}
                    {kes(e.amount_kes)}
                  </td>
                  <td className="py-2 pl-4">{r ? <span className="rounded-md bg-low-bg px-2 py-0.5 text-xs font-bold text-low-fg">{r.question || (r.ask_to ? `Ask ${nameOf(r.ask_to)}` : "Needs a look")}</span> : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!shown.length && <p className="py-6 text-center text-muted">Nothing matches.</p>}
      </div>

      {open && (
        <EntrySheet
          e={open}
          title={title(open)}
          kind={kindOf(open)}
          who={nameOf(open.spent_by)}
          bill={bills.find((b) => b.id === open.bill_id)}
          review={reviewOf(open.id)}
          people={people.filter((p) => p.id !== meId)}
          nameOf={nameOf}
          onClose={() => setOpen(null)}
          onAsk={(to, q) => {
            onAsk(open, to, q);
            setOpen(null);
          }}
          onMeeting={() => {
            onMeeting(open);
            setOpen(null);
          }}
          onAnswer={(r) => {
            onAnswer(r);
            setOpen(null);
          }}
          onCorrect={() => {
            onCorrect(open);
            setOpen(null);
          }}
        />
      )}
    </>
  );
}

function EntrySheet({
  e,
  title,
  kind,
  who,
  bill,
  review,
  people,
  nameOf,
  onClose,
  onAsk,
  onMeeting,
  onAnswer,
  onCorrect,
}: {
  e: Full;
  title: string;
  kind: string;
  who: string;
  bill?: Bill;
  review?: Review;
  people: Person[];
  nameOf: (id?: string | null) => string;
  onClose: () => void;
  onAsk: (to: string | null, question: string) => void;
  onMeeting: () => void;
  onAnswer: (r: Review) => void;
  onCorrect: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [to, setTo] = useState<string>("");
  const [question, setQuestion] = useState("");
  const [fixing, setFixing] = useState(false);
  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="flex flex-col gap-4 pb-2">
        <div>
          <p className="eyebrow">{day(e.occurred_on)}</p>
          <h2 className="font-display text-2xl">{title}</h2>
          <p className={`font-display text-4xl tabular ${e.direction === "in" ? "text-ok-fg" : ""}`}>
            {e.direction === "in" ? "+" : "−"}
            {kes(e.amount_kes)}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Kind</dt>
          <dd>{kind}</dd>
          {who && (
            <>
              <dt className="text-muted">{e.direction === "in" ? "Logged by" : "Spent by"}</dt>
              <dd>{who}</dd>
            </>
          )}
          {e.counterparty && (
            <>
              <dt className="text-muted">{e.direction === "in" ? "From" : "Paid to"}</dt>
              <dd>{e.counterparty}</dd>
            </>
          )}
          {e.method && (
            <>
              <dt className="text-muted">How</dt>
              <dd>{METHOD[e.method] ?? e.method}</dd>
            </>
          )}
          {e.mpesa_code && (
            <>
              <dt className="text-muted">M-Pesa code</dt>
              <dd className="font-mono">{e.mpesa_code}</dd>
            </>
          )}
          {e.usage_qty && bill?.usage_unit && (
            <>
              <dt className="text-muted">Got</dt>
              <dd>
                {e.usage_qty} {bill.usage_unit}
              </dd>
            </>
          )}
        </dl>

        {review && (
          <div className="rounded-xl bg-low-bg p-3 text-low-fg">
            <p className="text-sm">
              <strong>{nameOf(review.actor_id) || "Someone"} asked{review.ask_to ? ` ${nameOf(review.ask_to)}` : ""}:</strong> {review.question || "Can you check this?"}
            </p>
            <button type="button" onClick={() => onAnswer(review)} className="mt-2 min-h-10 rounded-xl bg-raised px-4 text-sm font-bold text-ink">
              Looks right ✓
            </button>
          </div>
        )}

        {asking ? (
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              onAsk(to || null, question.trim());
            }}
            className="flex flex-col gap-3 rounded-xl border border-line p-3"
          >
            <label className="flex flex-col gap-1 text-sm font-bold">
              Ask
              <select value={to} onChange={(ev) => setTo(ev.target.value)} className="min-h-12 rounded-xl border border-line bg-raised px-3 font-normal">
                <option value="">Anyone at home</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold">
              Question
              <input autoFocus value={question} maxLength={200} onChange={(ev) => setQuestion(ev.target.value)} placeholder="e.g. Was this the 13 kg cylinder?" className="min-h-12 rounded-xl border border-line bg-raised px-3 font-normal" />
            </label>
            <button type="submit" className="min-h-12 rounded-xl bg-brand font-bold text-brand-contrast">
              Send question
            </button>
          </form>
        ) : fixing ? (
          <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
            <p className="text-sm">Cancel this entry with a correction? It stops counting, and the record keeps both.</p>
            <div className="flex gap-2">
              <button type="button" onClick={onCorrect} className="min-h-12 flex-1 rounded-xl bg-brand font-bold text-brand-contrast">
                Yes, correct it
              </button>
              <button type="button" onClick={() => setFixing(false)} className="min-h-12 rounded-xl px-4 font-bold">
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setAsking(true)} className="min-h-12 rounded-xl border border-line font-bold">
              Ask someone
            </button>
            <button type="button" onClick={onMeeting} className="min-h-12 rounded-xl border border-line font-bold">
              Ask at the meeting
            </button>
            <button type="button" onClick={() => setFixing(true)} className="col-span-2 min-h-12 rounded-xl text-sm font-bold text-muted underline underline-offset-4">
              Wrong? Correct it
            </button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
