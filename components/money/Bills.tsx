"use client";

import { useState, type FormEvent } from "react";
import { billInsight, billStats, type Bill } from "@/lib/money/bills";
import type { Entry } from "@/lib/money/money";
import { kes } from "@/lib/shopping/pricing";

const field = "min-h-12 w-full rounded-xl border border-line bg-base px-3";
const dueText = (d: number) => (d < 0 ? `${-d} day${d === -1 ? "" : "s"} overdue` : d === 0 ? "due today" : d === 1 ? "due tomorrow" : `due in ${d} days`);

// Bills the house pays again and again. Each payment can say how much was bought, so the family
// sees cost per unit, how long it lasts, and when a month runs heavier than usual.
export function Bills({
  bills,
  entries,
  today,
  onPay,
  onAdd,
  onRemove,
}: {
  bills: Bill[];
  entries: Entry[];
  today: string;
  onPay: (b: Bill) => void;
  onAdd: (b: { name: string; usage_unit: string | null; every_days: number | null; usual_kes: number | null }) => void;
  onRemove: (b: Bill) => void;
}) {
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

      <ul className="mt-3 flex flex-col divide-y divide-line">
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
    </section>
  );
}
