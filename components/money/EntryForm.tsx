"use client";

import { useEffect, useState, type FormEvent } from "react";
import { parseMpesa } from "@/lib/money/mpesa";
import { ruleFor, type Rule } from "@/lib/money/rules";
import type { Bill } from "@/lib/money/bills";
import type { Project } from "@/lib/money/money";
import type { NewEntry } from "@/lib/sync/workflows";
import type { Row } from "@/lib/sync/tables";

type Category = Row & { name: string; sort: number };
export type Draft = Partial<NewEntry> & { direction: "in" | "out" };

const field = "min-h-12 w-full rounded-xl border border-line bg-base px-3";
const today = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

// Money in or out: amount, day, what it was for (category or a project), who, how, a note.
// Paste an M-Pesa SMS and it fills itself in.
export function EntryForm({
  start,
  categories,
  projects,
  bills = [],
  rules = [],
  meId,
  initialSms,
  onSave,
  onCancel,
}: {
  start: Draft;
  categories: Category[];
  projects: Project[];
  bills?: Bill[];
  rules?: Rule[];
  meId?: string;
  /** An M-Pesa message shared into the app: read it straight away. */
  initialSms?: string;
  onSave: (e: NewEntry) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>({ occurred_on: today(), method: "mpesa", spent_by: meId ?? null, ...start });
  const [amount, setAmount] = useState(start.amount_kes ? String(start.amount_kes) : "");
  const [usage, setUsage] = useState("");
  const bill = bills.find((b) => b.id === d.bill_id);
  const used = Number(usage.replace(",", "."));
  const [sms, setSms] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (c: Partial<Draft>) => setD((x) => ({ ...x, ...c }));
  const value = Number(amount.replace(/[, ]/g, ""));

  function readSms(text: string) {
    setSms(text);
    const m = parseMpesa(text);
    if (!m) return setNote(text.trim() ? "That doesn't look like an M-Pesa confirmation." : null);
    if (m.kind === "withdraw") return setNote(`A cash withdrawal (${m.amount.toLocaleString("en-KE")}): money moving to cash, not spending, so it isn't logged.`);
    setAmount(String(m.amount));
    // A saved rule for this payee sorts it: kind, bill and shop.
    const r = m.direction === "out" ? ruleFor(m.counterparty, rules) : undefined;
    const bill = r?.bill_id ? bills.find((b) => b.id === r.bill_id) : undefined;
    set({
      direction: m.direction!,
      counterparty: m.counterparty,
      occurred_on: m.date ?? today(),
      mpesa_code: m.code,
      method: "mpesa",
      note: d.note ?? bill?.name ?? m.counterparty,
      ...(r ? { category_id: r.category_id ?? bill?.category_id ?? d.category_id ?? null, bill_id: r.bill_id ?? null, shop_id: r.shop_id ?? null, project_id: null } : {}),
    });
    setNote(r ? `Filled in from ${m.code} and sorted by your rule for ${r.match}. Check it and save.` : `Filled in from ${m.code}. Check it and save.`);
  }

  useEffect(() => {
    if (initialSms) readSms(initialSms);
    // Once, when the form opens with a shared message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!(value > 0)) return;
    setBusy(true);
    const err = await onSave({
      direction: d.direction,
      amount_kes: value,
      occurred_on: d.occurred_on ?? today(),
      category_id: d.project_id ? null : (d.category_id ?? null),
      project_id: d.project_id ?? null,
      method: d.method ?? null,
      spent_by: d.spent_by ?? null,
      note: d.note?.trim() || null,
      counterparty: d.counterparty ?? null,
      mpesa_code: d.mpesa_code ?? null,
      bill_id: d.bill_id ?? null,
      shop_id: d.shop_id ?? null,
      paid_from: d.direction === "out" && !d.project_id ? (d.paid_from ?? "house") : "house",
      usage_qty: bill?.usage_unit && used > 0 ? used : null,
    });
    setBusy(false);
    if (err) setNote(err);
  }

  const open = projects.filter((p) => p.status !== "done" && !p.deleted_at);

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border-2 border-brand bg-raised p-4">
      <div role="radiogroup" aria-label="Money in or out" className="grid grid-cols-2 gap-2">
        {(["in", "out"] as const).map((dir) => (
          <button
            key={dir}
            type="button"
            role="radio"
            aria-checked={d.direction === dir}
            onClick={() => set({ direction: dir })}
            className={`min-h-12 rounded-xl border font-bold ${d.direction === dir ? "border-brand bg-brand text-brand-contrast" : "border-line"}`}
          >
            {dir === "in" ? "+ Money in" : "− Money out"}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1 text-sm font-bold">
        📲 Paste an M-Pesa SMS (optional)
        <textarea rows={3} value={sms} onChange={(e) => readSms(e.target.value)} placeholder="e.g. SJK7AB12CD Confirmed. Ksh1,060.00 paid to NAIVAS…" className="w-full rounded-xl border border-line bg-base p-3 font-normal" />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm font-bold">
          Amount (KES)
          <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} text-lg tabular`} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          Day
          <input type="date" value={d.occurred_on} onChange={(e) => set({ occurred_on: e.target.value })} className={field} />
        </label>
      </div>

      {bill?.usage_unit && (
        <label className="flex flex-col gap-1 text-sm font-bold">
          How much did you get? ({bill.usage_unit})
          <input inputMode="decimal" value={usage} onChange={(e) => setUsage(e.target.value)} placeholder={`e.g. ${bill.usage_unit === "kg" ? "13" : bill.usage_unit === "litres" ? "5000" : "10"}`} className={`${field} tabular`} />
          <span className="font-normal text-muted">This is what shows how much the house uses.</span>
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm font-bold">
        {d.direction === "in" ? "For" : "What for"}
        <select
          value={d.project_id ? `p:${d.project_id}` : (d.category_id ?? "")}
          onChange={(e) => (e.target.value.startsWith("p:") ? set({ project_id: e.target.value.slice(2), category_id: null }) : set({ category_id: e.target.value || null, project_id: null }))}
          className={field}
        >
          <option value="">{d.direction === "in" ? "The house (this month's money)" : "Choose…"}</option>
          {d.direction === "out" &&
            categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          {open.length > 0 && (
            <optgroup label="Projects">
              {open.map((p) => (
                <option key={p.id} value={`p:${p.id}`}>
                  {p.kind === "upgrade" ? "✨ " : "🔨 "}
                  {p.title}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      {d.direction === "out" && !d.project_id && (
        <div role="radiogroup" aria-label="Paid from" className="flex flex-col gap-1">
          <span className="text-sm font-bold">Paid from</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["house", "House money"],
                ["own", "My own money"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={(d.paid_from ?? "house") === id} onClick={() => set({ paid_from: id })} className={`min-h-12 rounded-xl border ${(d.paid_from ?? "house") === id ? "border-ink bg-ink text-raised" : "border-line"}`}>
                {label}
              </button>
            ))}
          </div>
          {d.paid_from === "own" && <span className="text-sm text-muted">The house will owe you this. It shows under Settle up until you&apos;re paid back.</span>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm font-bold">
          How
          <select value={d.method ?? ""} onChange={(e) => set({ method: (e.target.value || null) as Draft["method"] })} className={field}>
            <option value="mpesa">M-Pesa</option>
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-bold">
          {d.direction === "in" ? "From" : "Paid to"}
          <input value={d.counterparty ?? ""} onChange={(e) => set({ counterparty: e.target.value || null })} placeholder={d.direction === "in" ? "e.g. Peter" : "e.g. Naivas"} className={field} />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm font-bold">
        Note
        <input value={d.note ?? ""} onChange={(e) => set({ note: e.target.value })} placeholder="Optional" className={field} />
      </label>

      {note && <p className="text-sm text-muted">{note}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !(value > 0)} className="min-h-12 flex-1 rounded-xl bg-brand font-bold text-brand-contrast disabled:opacity-50">
          Save {value > 0 ? `KES ${Math.round(value).toLocaleString("en-KE")}` : ""}
        </button>
        <button type="button" onClick={onCancel} className="min-h-12 rounded-xl px-4 font-bold text-brand">
          Cancel
        </button>
      </div>
      <p className="text-xs text-muted">Entries can&apos;t be edited later. A mistake is fixed with a correction, which keeps the record honest.</p>
    </form>
  );
}
