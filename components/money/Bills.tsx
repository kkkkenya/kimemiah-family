"use client";

import { useEffect, useState, type FormEvent } from "react";
import { billInsight, billStats, dueDatesIn, findRepeats, type Bill } from "@/lib/money/bills";
import { liveEntries, type Entry } from "@/lib/money/money";
import { kes } from "@/lib/shopping/pricing";

const field = "min-h-12 w-full rounded-xl border border-line bg-base px-3";
type Repeat = ReturnType<typeof findRepeats>[number];
const DISMISSED = "bills.notABill";
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
const dueText = (d: number) => (d < 0 ? `${-d} day${d === -1 ? "" : "s"} overdue` : d === 0 ? "due today" : d === 1 ? "due tomorrow" : `due in ${d} days`);

// Bills the house pays again and again. Each payment can say how much was bought, so the family
// sees cost per unit, how long it lasts, and when a month runs heavier than usual.
export function Bills({
  bills,
  entries,
  today,
  month,
  onPay,
  onAdd,
  onRemove,
  onRemind,
  onMakeBill,
}: {
  bills: (Bill & { remind?: boolean })[];
  entries: Entry[];
  today: string;
  month: string;
  onPay: (b: Bill) => void;
  onAdd: (b: { name: string; usage_unit: string | null; every_days: number | null; usual_kes: number | null }) => void;
  onRemove: (b: Bill) => void;
  onRemind: (b: Bill, on: boolean) => void;
  onMakeBill: (r: Repeat) => void;
}) {
  const [tab, setTab] = useState<"list" | "calendar">("list");
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => {
    try {
      setDismissed(JSON.parse(localStorage.getItem(DISMISSED) ?? "[]"));
    } catch {}
  }, []);
  const repeats = findRepeats(entries, bills, today).filter((r) => !dismissed.includes(r.payee));
  function notABill(r: Repeat) {
    const next = [...dismissed, r.payee];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED, JSON.stringify(next));
    } catch {}
  }
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [monthly, setMonthly] = useState(false);
  const [usual, setUsual] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const live = bills.filter((b) => !b.deleted_at).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name));
  const usualKes = Number(usual.replace(/[, ]/g, ""));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({ name: name.trim(), usage_unit: unit.trim() || null, every_days: monthly ? 30 : null, usual_kes: usualKes > 0 ? usualKes : null });
    setAdding(false);
    setName("");
    setUnit("");
    setUsual("");
    setMonthly(false);
  }

  return (
    <section aria-labelledby="bills" className="rounded-2xl border border-line bg-raised p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="bills" className="font-display text-xl">
          Bills
        </h2>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="min-h-12 rounded-xl border border-line px-4 text-sm font-bold">
            + Add a bill
          </button>
        )}
      </div>
      <p className="text-sm text-muted">Log each payment with how much you got, and see what the house really uses.</p>

      {repeats.slice(0, 2).map((r) => (
        <div key={r.payee} className="mt-3 rounded-xl bg-base p-3">
          <p className="text-sm">
            <strong>{r.name}</strong> was paid around the {ordinal(r.day)} for {r.months} months (about {kes(r.usual)}). Make it a bill?
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => onMakeBill(r)} className="min-h-10 rounded-xl bg-brand px-4 text-sm font-bold text-brand-contrast">
              Make it a bill
            </button>
            <button type="button" onClick={() => notABill(r)} className="min-h-10 rounded-xl px-3 text-sm font-bold text-muted">
              Not a bill
            </button>
          </div>
        </div>
      ))}

      <div role="tablist" aria-label="Show bills as" className="mt-3 grid grid-cols-2 rounded-xl border border-line p-1 text-sm lg:hidden">
        {(
          [
            ["list", "List"],
            ["calendar", "Calendar"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`min-h-10 rounded-xl ${tab === id ? "bg-ink text-raised" : "text-muted"}`}>
            {label}
          </button>
        ))}
      </div>

      {adding && (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2 rounded-xl border border-line p-3">
          <label className="flex flex-col gap-1 text-sm font-bold">
            Bill
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Water, Cooking gas, Internet" className={field} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm font-bold">
              Measured in
              <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="litres, kg, GB, or blank" className={field} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-bold">
              Usual cost (KES)
              <input inputMode="numeric" value={usual} onChange={(e) => setUsual(e.target.value)} placeholder="Optional" className={`${field} tabular`} />
            </label>
          </div>
          <label className="flex min-h-12 items-center gap-3 text-sm">
            <input type="checkbox" checked={monthly} onChange={(e) => setMonthly(e.target.checked)} className="size-6" />
            Paid every month (leave off for things bought when they run out)
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={!name.trim()} className="min-h-12 flex-1 rounded-xl bg-brand font-bold text-brand-contrast disabled:opacity-50">
              Add bill
            </button>
            <button type="button" onClick={() => setAdding(false)} className="min-h-12 rounded-xl px-4 font-bold text-brand">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="lg:mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start lg:gap-8">
      <ul className={`mt-3 flex-col divide-y divide-line lg:mt-0 lg:flex ${tab === "list" ? "flex" : "hidden"}`}>
        {live.map((b) => {
          const s = billStats(b, entries, today);
          const insight = billInsight(b, s);
          return (
            <li key={b.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <button type="button" aria-expanded={open === b.id} onClick={() => setOpen(open === b.id ? null : b.id)} className="min-h-12 min-w-0 flex-1 text-left">
                  <span className="block font-bold">{b.name}</span>
                  <span className="block text-sm text-muted">
                    {s.last ? `Last ${kes(s.last.amount_kes)} on ${new Date(`${s.last.occurred_on}T09:00:00Z`).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}` : "Not paid yet"}
                    {s.dueIn !== null && <span className={s.dueIn <= 2 ? " font-bold text-out-strong" : ""}> · {dueText(s.dueIn)}</span>}
                  </span>
                  {insight && <span className={`mt-1 inline-block rounded-md px-2 py-0.5 text-xs font-bold ${s.change !== null && s.change >= 15 ? "bg-low-bg text-low-fg" : "bg-base"}`}>{insight}</span>}
                </button>
                <button type="button" onClick={() => onPay(b)} className="min-h-12 shrink-0 rounded-xl bg-brand px-4 font-bold text-brand-contrast">
                  Pay
                </button>
              </div>
              {open === b.id && (
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm tabular">
                  <div className="rounded-xl bg-base p-2">
                    <dt className="text-xs text-muted">This month</dt>
                    <dd className="font-bold">{kes(s.thisMonth)}</dd>
                  </div>
                  <div className="rounded-xl bg-base p-2">
                    <dt className="text-xs text-muted">Usual month</dt>
                    <dd className="font-bold">{s.usualMonth ? kes(s.usualMonth) : "Not yet known"}</dd>
                  </div>
                  {b.usage_unit && (
                    <div className="rounded-xl bg-base p-2">
                      <dt className="text-xs text-muted">Cost per {b.usage_unit.replace(/s$/, "")}</dt>
                      <dd className="font-bold">{s.perUnit ? `KES ${s.perUnit < 10 ? s.perUnit.toFixed(2) : Math.round(s.perUnit)}` : "Log how much you got"}</dd>
                    </div>
                  )}
                  <div className="rounded-xl bg-base p-2">
                    <dt className="text-xs text-muted">{b.every_days ? "Paid every" : "One lasts"}</dt>
                    <dd className="font-bold">{b.every_days ? `${b.every_days} days` : s.lasts ? `about ${s.lasts} days` : "After two payments"}</dd>
                  </div>
                  <label className="col-span-2 flex min-h-12 items-center justify-between gap-3 rounded-xl bg-base px-3">
                    <span>Remind everyone the evening before</span>
                    <input type="checkbox" checked={b.remind !== false} onChange={(e) => onRemind(b, e.target.checked)} className="size-5 accent-[var(--action)]" />
                  </label>
                  <div className="col-span-2">
                    <button type="button" onClick={() => onRemove(b)} className="min-h-10 text-sm font-bold text-muted underline underline-offset-4">
                      Remove this bill
                    </button>
                  </div>
                </dl>
              )}
            </li>
          );
        })}
      </ul>
      <div className={`mt-3 lg:mt-0 lg:block ${tab === "calendar" ? "block" : "hidden"}`}>
        <BillCalendar bills={live} entries={entries} today={today} month={month} />
      </div>
      </div>
    </section>
  );
}

type Mark = { day: string; bill: Bill; paid: boolean; amount: number };

/** The month as a grid: orange for what's due, green for what's paid. Tap a day for its list. */
function BillCalendar({ bills, entries, today, month }: { bills: Bill[]; entries: Entry[]; today: string; month: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  const marks: Mark[] = [];
  for (const b of bills) {
    const s = billStats(b, entries, today);
    for (const d of dueDatesIn(b, s, month)) marks.push({ day: d, bill: b, paid: false, amount: Number(s.last?.amount_kes ?? b.usual_kes ?? 0) });
  }
  for (const e of liveEntries(entries)) {
    const b = bills.find((x) => x.id === e.bill_id);
    if (b && e.direction === "out" && e.occurred_on.startsWith(month)) marks.push({ day: e.occurred_on, bill: b, paid: true, amount: Number(e.amount_kes) });
  }
  const first = new Date(`${month}-01T00:00:00Z`);
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const on = (d: string) => marks.filter((m) => m.day === d);
  const sel = picked ?? marks.filter((m) => !m.paid && m.day >= today).sort((a, b) => a.day.localeCompare(b.day))[0]?.day ?? null;
  const list = sel ? on(sel) : [];
  const due = marks.filter((m) => !m.paid).reduce((s, m) => s + m.amount, 0);

  return (
    <div>
      <p className="mb-2 flex items-baseline justify-between text-sm">
        <span className="eyebrow">{new Date(`${month}-15T09:00:00Z`).toLocaleDateString("en-KE", { month: "long" })}</span>
        <span className="text-muted tabular">{kes(due)} still due</span>
      </p>
      <div className="grid grid-cols-7 gap-1 text-center text-xs tabular" role="grid" aria-label="Bills calendar">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="py-1 font-bold text-muted" aria-hidden="true">
            {d}
          </span>
        ))}
        {cells.map((d, i) =>
          d ? (
            <button
              key={d}
              type="button"
              onClick={() => setPicked(d)}
              aria-label={`${Number(d.slice(8))}: ${on(d).map((m) => `${m.bill.name} ${m.paid ? "paid" : "due"}`).join(", ") || "nothing"}`}
              className={`relative flex aspect-square flex-col items-center justify-start gap-0.5 rounded-lg pt-1.5 lg:aspect-auto lg:min-h-16 lg:items-start lg:px-1.5 ${on(d).length ? "bg-base" : ""} ${d === sel ? "ring-2 ring-ink" : d === today ? "ring-1 ring-line" : ""}`}
            >
              <span className={on(d).length ? "font-bold" : "text-muted"}>{Number(d.slice(8))}</span>
              <span className="flex gap-0.5 lg:hidden">
                {on(d).map((m, j) => (
                  <span key={j} className={`size-1.5 rounded-full ${m.paid ? "bg-ok-fg" : "bg-action"}`} />
                ))}
              </span>
              <span className="hidden w-full flex-col gap-0.5 text-left lg:flex">
                {on(d).map((m, j) => (
                  <span key={j} className={`truncate rounded px-1 text-[0.65rem] leading-4 ${m.paid ? "bg-ok-bg text-ok-fg" : "bg-action text-action-ink"}`}>
                    {m.bill.name}
                  </span>
                ))}
              </span>
            </button>
          ) : (
            <span key={`x${i}`} aria-hidden="true" />
          ),
        )}
      </div>
      {sel && (
        <div className="mt-3 rounded-xl bg-base p-3">
          <p className="eyebrow">
            {new Date(`${sel}T09:00:00Z`).toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "short" })}
            {list.length ? ` · ${kes(list.reduce((s, m) => s + m.amount, 0))}` : ""}
          </p>
          {list.length ? (
            <ul className="mt-1 text-sm">
              {list.map((m, j) => (
                <li key={j} className="flex justify-between gap-2 py-1">
                  <span>
                    {m.bill.name} <span className="text-muted">{m.paid ? "· paid" : "· due"}</span>
                  </span>
                  <span className="tabular">{m.amount ? kes(m.amount) : "–"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted">Nothing due.</p>
          )}
        </div>
      )}
    </div>
  );
}
