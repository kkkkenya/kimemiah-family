"use client";

import { useState, type FormEvent } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { GROUPS, type Group, type Kind, flexSummary } from "@/lib/money/flex";
import { kes } from "@/lib/shopping/pricing";

type Summary = ReturnType<typeof flexSummary>;
type Row = Summary["rows"][number];
const field = "min-h-12 w-full rounded-xl border border-line bg-raised px-3";

// Flex budget: one number for day to day (flexible money left), the three groups under it, and a
// sheet to set a kind's plan and group. On a laptop the same figures come as a full table.
export function FlexBudget({
  summary,
  monthName,
  onSave,
  onAddYearly,
}: {
  summary: Summary;
  monthName: string;
  onSave: (k: Kind, plan: number, group: Group) => void;
  onAddYearly: (name: string, yearly: number) => void;
}) {
  const [group, setGroup] = useState<Group>("flexible");
  const [editing, setEditing] = useState<Row | null>(null);
  const [yearly, setYearly] = useState(false);
  const shown = summary.groups.find((g) => g.id === group)!;

  return (
    <>
      <section className="rounded-2xl border border-line bg-raised p-5 lg:hidden">
        <div role="tablist" aria-label="Budget groups" className="grid grid-cols-3 rounded-xl border border-line p-1 text-sm">
          {GROUPS.map((g) => (
            <button key={g.id} type="button" role="tab" aria-selected={group === g.id} onClick={() => setGroup(g.id)} className={`min-h-10 rounded-xl ${group === g.id ? "bg-ink text-raised" : "text-muted"}`}>
              {g.label}
            </button>
          ))}
        </div>
        <p className="mt-3 flex items-baseline justify-between gap-2 text-sm">
          <span className="text-muted">{shown.hint}</span>
          <span className="shrink-0 tabular">{shown.plan > 0 ? `${kes(shown.spent)} of ${kes(shown.plan)}` : `${kes(shown.spent)} spent`}</span>
        </p>
        <ul className="mt-2 flex flex-col divide-y divide-line">
          {shown.rows.map((r) => (
            <li key={r.kind.id}>
              <button type="button" onClick={() => setEditing(r)} className="flex w-full flex-col gap-1.5 py-3 text-left">
                <span className="flex w-full items-baseline justify-between gap-2">
                  <span className="font-bold">{r.kind.name}</span>
                  <span className="text-sm tabular">{r.plan ? `${kes(r.spent)} / ${kes(r.available)}` : <span className="text-action-text">Set a budget</span>}</span>
                </span>
                <span className="h-2 w-full overflow-hidden rounded-full bg-base" aria-hidden="true">
                  <span className={`block h-full rounded-full ${r.pct > 1 ? "bg-out-strong" : r.pct >= 0.8 ? "bg-action" : "bg-ink"}`} style={{ width: `${Math.min(100, r.pct * 100)}%` }} />
                </span>
                {(r.forecast || r.carry !== 0) && (
                  <span className="text-xs text-muted">
                    {r.forecast ? `On pace for ${kes(r.forecast)} by month end` : `${r.carry > 0 ? "+" : "−"}${kes(Math.abs(r.carry))} carried in`}
                  </span>
                )}
              </button>
            </li>
          ))}
          {!shown.rows.length && <li className="py-3 text-sm text-muted">No kinds in {shown.label.toLowerCase()} yet. Move one here from its budget sheet.</li>}
        </ul>
        {group === "non_monthly" && (
          <button type="button" onClick={() => setYearly(true)} className="mt-2 min-h-12 rounded-xl border border-line px-4 text-sm font-bold">
            + Save up for a yearly cost
          </button>
        )}
      </section>

      {/* Laptop: the whole budget at once, for the family meeting. */}
      <div className="hidden rounded-2xl border border-line bg-raised p-6 lg:block">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl">Budget, {monthName}</h2>
          <button type="button" onClick={() => setYearly(true)} className="min-h-10 rounded-xl border border-line px-4 text-sm font-bold">
            + Save up for a yearly cost
          </button>
        </div>
        <table className="mt-4 w-full text-sm tabular">
          <thead>
            <tr className="eyebrow text-left">
              <th className="py-2 font-medium">Kind</th>
              <th className="py-2 text-right font-medium">Plan</th>
              <th className="py-2 text-right font-medium">Carried in</th>
              <th className="py-2 text-right font-medium">Spent</th>
              <th className="py-2 text-right font-medium">Left</th>
              <th className="py-2 text-right font-medium">Month-end pace</th>
              <th className="w-1/5 py-2 pl-4 font-medium">Used</th>
            </tr>
          </thead>
          {summary.groups.map((g) => (
            <tbody key={g.id} className="border-t border-line">
              <tr>
                <th colSpan={7} className="pb-1 pt-4 text-left">
                  <span className="font-display text-lg">{g.label}</span>
                  <span className="ml-2 text-xs text-muted">
                    {kes(g.spent)} of {kes(g.plan)} · {kes(g.left)} left
                  </span>
                </th>
              </tr>
              {g.rows.map((r) => (
                <tr key={r.kind.id} className="border-t border-line/60 hover:bg-base">
                  <td className="py-2">
                    <button type="button" onClick={() => setEditing(r)} className="text-left underline-offset-4 hover:underline">
                      {r.kind.name}
                    </button>
                  </td>
                  <td className="py-2 text-right">{r.plan ? kes(r.plan) : "–"}</td>
                  <td className="py-2 text-right text-muted">{r.carry ? kes(r.carry) : "–"}</td>
                  <td className="py-2 text-right">{kes(r.spent)}</td>
                  <td className={`py-2 text-right ${r.left < 0 ? "font-bold text-out-strong" : ""}`}>{r.available ? kes(r.left) : "–"}</td>
                  <td className="py-2 text-right text-muted">{r.forecast ? kes(r.forecast) : "–"}</td>
                  <td className="py-2 pl-4">
                    <span className="flex items-center gap-2">
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-base">
                        <span className={`block h-full rounded-full ${r.pct > 1 ? "bg-out-strong" : r.pct >= 0.8 ? "bg-action" : "bg-ink"}`} style={{ width: `${Math.min(100, r.pct * 100)}%` }} />
                      </span>
                      <span className="w-10 text-right text-xs text-muted">{r.available ? `${Math.round(r.pct * 100)}%` : ""}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {editing && (
        <BudgetSheet
          row={editing}
          monthName={monthName}
          onClose={() => setEditing(null)}
          onSave={(plan, g) => {
            onSave(editing.kind, plan, g);
            setEditing(null);
          }}
        />
      )}
      {yearly && (
        <YearlySheet
          onClose={() => setYearly(false)}
          onSave={(name, amount) => {
            onAddYearly(name, amount);
            setYearly(false);
          }}
        />
      )}
    </>
  );
}

function BudgetSheet({ row, monthName, onClose, onSave }: { row: Row; monthName: string; onClose: () => void; onSave: (plan: number, g: Group) => void }) {
  const [plan, setPlan] = useState(row.plan ? String(row.plan) : "");
  const [g, setG] = useState<Group>(row.group);
  const value = Number(plan.replace(/[, ]/g, ""));
  function submit(e: FormEvent) {
    e.preventDefault();
    if (value >= 0) onSave(value, g);
  }
  return (
    <BottomSheet title={`${row.kind.name} budget`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4 pb-2">
        <h2 className="font-display text-2xl">{row.kind.name}</h2>
        <p className="text-sm text-muted">
          {kes(row.spent)} spent in {monthName}
          {row.carry ? ` · ${kes(row.carry)} carried in` : ""}
        </p>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Plan each month (KES)
          <input autoFocus inputMode="numeric" value={plan} onChange={(e) => setPlan(e.target.value)} className={`${field} text-lg tabular`} />
          <span className="font-normal text-muted">It repeats every month until you change it.</span>
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold">Group</legend>
          {GROUPS.map((x) => (
            <label key={x.id} className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 ${g === x.id ? "border-ink" : "border-line"}`}>
              <input type="radio" name="group" checked={g === x.id} onChange={() => setG(x.id)} className="size-5 accent-[var(--action)]" />
              <span>
                <span className="block">{x.label}</span>
                <span className="text-xs text-muted">{x.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <button type="submit" disabled={!(value >= 0) || plan.trim() === ""} className="min-h-12 rounded-xl bg-brand font-bold text-brand-contrast disabled:opacity-50">
          Save
        </button>
      </form>
    </BottomSheet>
  );
}

function YearlySheet({ onClose, onSave }: { onClose: () => void; onSave: (name: string, yearly: number) => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const value = Number(amount.replace(/[, ]/g, ""));
  return (
    <BottomSheet title="Save up for a yearly cost" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && value > 0) onSave(name.trim(), value);
        }}
        className="flex flex-col gap-4 pb-2"
      >
        <h2 className="font-display text-2xl">Save up for a yearly cost</h2>
        <label className="flex flex-col gap-1 text-sm font-bold">
          What is it?
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. School fees, Car insurance" className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Whole year (KES)
          <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} tabular`} />
          {value > 0 && <span className="font-normal text-muted">Puts aside {kes(Math.ceil(value / 12))} a month. What isn&apos;t spent carries over.</span>}
        </label>
        <button type="submit" disabled={!name.trim() || !(value > 0)} className="min-h-12 rounded-xl bg-brand font-bold text-brand-contrast disabled:opacity-50">
          Start saving
        </button>
      </form>
    </BottomSheet>
  );
}
