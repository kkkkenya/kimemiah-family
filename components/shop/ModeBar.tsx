"use client";

import { kes, type Mode } from "@/lib/shopping/pricing";

type Totals = { essential: number; full: number; upgrades: number };

// Essentials / Full shop / + Upgrades, each with its estimated total, and the month's money left.
export function ModeBar({
  mode,
  onChange,
  totals,
  estimate,
  unpriced,
  moneyLeft,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  totals: Totals;
  estimate: number;
  unpriced: number;
  moneyLeft: number | null;
}) {
  const over = moneyLeft != null && estimate > moneyLeft;
  const pill = (active: boolean) =>
    `min-h-12 rounded-full border px-3 text-sm font-bold leading-tight ${
      active ? "border-brand bg-brand text-brand-contrast" : "border-line bg-raised text-ink"
    }`;

  return (
    <div className="sticky top-[calc(env(safe-area-inset-top)+4.25rem)] z-[5] -mx-4 flex flex-col gap-2 bg-base px-4 pb-2 pt-1">
      <div role="group" aria-label="What to shop for" className="grid grid-cols-3 gap-2">
        <button type="button" aria-pressed={mode.base === "essential"} onClick={() => onChange({ ...mode, base: "essential" })} className={pill(mode.base === "essential")}>
          Essentials
          <span className="block font-normal tabular">{kes(totals.essential)}</span>
        </button>
        <button type="button" aria-pressed={mode.base === "full"} onClick={() => onChange({ ...mode, base: "full" })} className={pill(mode.base === "full")}>
          Full shop
          <span className="block font-normal tabular">{kes(totals.full)}</span>
        </button>
        <button type="button" aria-pressed={mode.upgrades} onClick={() => onChange({ ...mode, upgrades: !mode.upgrades })} className={pill(mode.upgrades)}>
          + Upgrades
          <span className="block font-normal tabular">{kes(totals.upgrades)}</span>
        </button>
      </div>
      <p className={`rounded-xl px-3 py-1.5 text-sm tabular ${over ? "bg-low-bg text-low-fg" : "text-muted"}`}>
        Estimated: <strong>{kes(estimate)}</strong>
        {unpriced > 0 && ` + ${unpriced} without a price`}
        {moneyLeft != null ? (
          <>
            {" · "}Money left this month: <strong>{kes(moneyLeft)}</strong>
            {over && " (over by " + kes(estimate - moneyLeft) + ")"}
          </>
        ) : (
          " · Money left shows once Dad's transfer is logged"
        )}
      </p>
    </div>
  );
}
