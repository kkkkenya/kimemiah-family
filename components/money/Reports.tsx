"use client";

import { useState } from "react";
import { Sankey } from "@/components/money/Sankey";
import type { Bill } from "@/lib/money/bills";
import type { Kind } from "@/lib/money/flex";
import { liveEntries, monthOf, monthSummary, type Entry } from "@/lib/money/money";
import { moneyFlow } from "@/lib/money/review";
import { kes } from "@/lib/shopping/pricing";

const shift = (m: string, by: number) => {
  const d = new Date(`${m}-15T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};
const short = (m: string) => new Date(`${m}-15T09:00:00Z`).toLocaleDateString("en-KE", { month: "short" });
const long = (m: string) => new Date(`${m}-15T09:00:00Z`).toLocaleDateString("en-KE", { month: "long" });
const card = "rounded-2xl border border-line bg-raised p-5";

// Reports (after Monarch): the Sankey of where money went, each kind over six months, spending
// by shop, and what the bills bought. A phone keeps each to a glance; a laptop adds the numbers.
export function Reports({
  entries,
  kinds,
  bills,
  shops,
  month,
  nameOf,
  onOpenReview,
}: {
  entries: Entry[];
  kinds: Kind[];
  bills: Bill[];
  shops: { id: string; name: string }[];
  month: string;
  nameOf: (id: string) => string;
  onOpenReview: () => void;
}) {
  const [range, setRange] = useState<1 | 3 | 6>(1);
  const months = Array.from({ length: range }, (_, i) => shift(month, i - range + 1));
  const six = Array.from({ length: 6 }, (_, i) => shift(month, i - 5));
  const flow = moneyFlow(entries, kinds, months, nameOf);
  const rangeLabel = range === 1 ? long(month) : `${short(months[0])} to ${short(month)}`;

  const byKind = kinds
    .filter((k) => !k.deleted_at)
    .map((k) => ({ k, per: six.map((m) => monthSummary(entries, m).byCategory.get(k.id) ?? 0) }))
    .filter((r) => r.per.some((v) => v > 0))
    .sort((a, b) => b.per.reduce((s, v) => s + v, 0) - a.per.reduce((s, v) => s + v, 0));
  const kindTop = Math.max(1, ...byKind.flatMap((r) => r.per));

  const shopTotals = new Map<string | null, number>();
  for (const e of liveEntries(entries)) {
    if (e.direction !== "out" || e.project_id || e.payback_to || !months.includes(monthOf(e.occurred_on))) continue;
    const s = (e as Entry & { shop_id?: string | null }).shop_id ?? null;
    shopTotals.set(s, (shopTotals.get(s) ?? 0) + Number(e.amount_kes));
  }
  const byShop = [...shopTotals].sort((a, b) => b[1] - a[1]);
  const shopTop = Math.max(1, ...byShop.map(([, v]) => v));

  const usage = bills
    .filter((b) => !b.deleted_at && b.usage_unit)
    .map((b) => ({
      b,
      per: six.map((m) => {
        const mine = liveEntries(entries).filter((e) => e.bill_id === b.id && monthOf(e.occurred_on) === m);
        return { used: mine.reduce((s, e) => s + Number(e.usage_qty ?? 0), 0), paid: mine.reduce((s, e) => s + Number(e.amount_kes), 0) };
      }),
    }))
    .filter((r) => r.per.some((p) => p.used > 0));

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
      <section className={`${card} lg:col-span-2`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="eyebrow">Where the money went</p>
            <p className="font-display text-2xl">{rangeLabel}</p>
          </div>
          <div role="radiogroup" aria-label="How many months" className="flex gap-1 rounded-xl border border-line p-1 text-sm">
            {([1, 3, 6] as const).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={range === r} onClick={() => setRange(r)} className={`min-h-9 rounded-xl px-3 ${range === r ? "bg-ink text-raised" : "text-muted"}`}>
                {r === 1 ? "Month" : `${r} months`}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-sm text-muted tabular">
          {kes(flow.moneyIn)} in · {kes(flow.spent)} spent
        </p>
        <div className="mt-3 lg:hidden">
          <Sankey columns={flow.columns} links={flow.links} />
        </div>
        <div className="mt-4 hidden lg:block">
          <Sankey columns={flow.columns} links={flow.links} wide />
        </div>
        <button type="button" onClick={onOpenReview} className="mt-3 min-h-12 rounded-xl border border-ink px-5 font-bold">
          Open the {long(shift(new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 7), -1))} review
        </button>
      </section>

      <section className={card}>
        <p className="eyebrow">Each kind, six months</p>
        {byKind.length ? (
          <>
            <ul className="mt-2 flex flex-col divide-y divide-line lg:hidden">
              {byKind.map(({ k, per }) => (
                <li key={k.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{k.name}</span>
                    <span className="text-xs text-muted tabular">{kes(per.at(-1)!)} this month</span>
                  </span>
                  <span className="flex h-8 shrink-0 items-end gap-1" aria-hidden="true">
                    {per.map((v, i) => (
                      <span key={i} className={`w-2.5 rounded-t-[3px] ${i === 5 ? "bg-action" : "bg-line"}`} style={{ height: `${Math.max(2, (v / kindTop) * 32)}px` }} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <table className="mt-2 hidden w-full text-sm tabular lg:table">
              <thead>
                <tr className="eyebrow text-left">
                  <th className="py-1 font-medium">Kind</th>
                  {six.map((m) => (
                    <th key={m} className="py-1 text-right font-medium">
                      {short(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byKind.map(({ k, per }) => (
                  <tr key={k.id} className="border-t border-line">
                    <td className="py-1.5">{k.name}</td>
                    {per.map((v, i) => (
                      <td key={i} className={`py-1.5 text-right ${i === 5 ? "font-bold" : "text-muted"}`}>
                        {v ? Math.round(v).toLocaleString("en-KE") : "–"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">Nothing spent yet.</p>
        )}
      </section>

      <section className={card}>
        <p className="eyebrow">By shop · {rangeLabel}</p>
        {byShop.length ? (
          <ul className="mt-2 flex flex-col gap-2">
            {byShop.map(([id, v]) => (
              <li key={id ?? "none"}>
                <div className="flex justify-between gap-2 text-sm">
                  <span>{shops.find((s) => s.id === id)?.name ?? "No shop given"}</span>
                  <span className="tabular">{kes(v)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-base">
                  <div className="h-full rounded-full bg-ink" style={{ width: `${(v / shopTop) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted">Nothing spent yet.</p>
        )}
      </section>

      {usage.length > 0 && (
        <section className={`${card} lg:col-span-2`}>
          <p className="eyebrow">What the bills bought, six months</p>
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {usage.map(({ b, per }) => {
              const top = Math.max(1, ...per.map((p) => p.used));
              return (
                <li key={b.id} className="py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span>{b.name}</span>
                    <span className="text-sm text-muted tabular">
                      {per.at(-1)!.used.toLocaleString("en-KE")} {b.usage_unit} this month
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-6 items-end gap-2">
                    {per.map((p, i) => (
                      <div key={i} className="flex flex-col items-center gap-1">
                        <div className="flex h-12 w-full items-end">
                          <div className={`w-full rounded-t-[3px] ${i === 5 ? "bg-action" : "bg-line"}`} style={{ height: `${Math.max(2, (p.used / top) * 48)}px` }} />
                        </div>
                        <span className="text-xs text-muted">{short(six[i])}</span>
                        <span className="hidden text-xs tabular lg:block">{p.used ? `${p.used.toLocaleString("en-KE")} ${b.usage_unit}` : "–"}</span>
                        <span className="hidden text-xs text-muted tabular lg:block">{p.paid ? kes(p.paid) : ""}</span>
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
