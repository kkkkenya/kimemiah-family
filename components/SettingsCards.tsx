"use client";

import { useState } from "react";
import { Card } from "@/components/Screen";
import { useSync } from "@/components/SyncProvider";
import { easing, type Person } from "@/lib/jobs/stats";
import { syncEngine } from "@/lib/sync/client";
import { useMe, useRows } from "@/lib/sync/hooks";
import type { Row } from "@/lib/sync/tables";

type HouseSettings = Row & { volunteer_after_days: number; ground_rules: string[]; push_kill_switch: boolean };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Nairobi" });

// Your own job preferences: what you can't do, and taking it easy for a week.
export function MyJobSettings() {
  const { syncNow } = useSync();
  const me = useMe() as (Person & { id: string }) | undefined;
  if (!me) return null;
  const set = async (change: Partial<Person>) => {
    await syncEngine().queue("members", "update", { id: me.id, ...change });
    void syncNow();
  };
  const easy = easing(me);

  return (
    <Card>
      <h2 className="font-bold">Your jobs</h2>
      <label className="mt-2 flex min-h-12 items-center gap-3">
        <input type="checkbox" checked={!!me.no_heavy} onChange={(e) => set({ no_heavy: e.target.checked })} className="size-6" />
        <span>
          No heavy jobs
          <span className="block text-sm text-muted">Heavy jobs aren&apos;t suggested to you. You can still join any job.</span>
        </span>
      </label>
      <label className="mt-2 flex min-h-12 items-center gap-3">
        <input
          type="checkbox"
          checked={easy}
          onChange={(e) => set({ ease_until: e.target.checked ? new Date(Date.now() + 7 * 86400_000).toISOString() : null })}
          className="size-6"
        />
        <span>
          Take it easy for a week{easy && me.ease_until ? ` (until ${day(me.ease_until)})` : ""}
          <span className="block text-sm text-muted">No jobs are suggested to you while it&apos;s on.</span>
        </span>
      </label>
    </Card>
  );
}

// Settings for the whole house: when a waiting job goes on the agenda, ground rules, and the
// switch that stops all push alerts.
export function HouseSettingsCard() {
  const { syncNow } = useSync();
  const s = (useRows<HouseSettings>("settings") ?? [])[0];
  const [rules, setRules] = useState<string | null>(null);
  if (!s) return null;
  const set = async (change: Partial<HouseSettings>) => {
    await syncEngine().queue("settings", "update", { id: s.id, ...change });
    void syncNow();
  };
  const text = rules ?? (s.ground_rules ?? []).join("\n");

  return (
    <Card>
      <h2 className="font-bold">The house</h2>
      <label className="mt-2 flex items-center justify-between gap-3">
        <span>
          Days before a waiting job goes on the meeting agenda
          <span className="block text-sm text-muted">Only jobs nobody has taken.</span>
        </span>
        <select value={s.volunteer_after_days} onChange={(e) => set({ volunteer_after_days: Number(e.target.value) })} className="min-h-12 rounded-xl border border-line bg-base px-2">
          {[1, 2, 3, 4, 5, 7, 10, 14].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 flex min-h-12 items-center gap-3">
        <input type="checkbox" checked={!!s.push_kill_switch} onChange={(e) => set({ push_kill_switch: e.target.checked })} className="size-6" />
        <span>
          Pause all alerts, on every phone
          <span className="block text-sm text-muted">For when something goes wrong or everyone needs quiet.</span>
        </span>
      </label>
      <label className="mt-3 flex flex-col gap-1 font-bold">
        Ground rules (one per line)
        <textarea
          rows={5}
          value={text}
          onChange={(e) => setRules(e.target.value)}
          onBlur={() => {
            if (rules === null) return;
            void set({ ground_rules: rules.split("\n").map((r) => r.trim()).filter(Boolean) });
            setRules(null);
          }}
          className="w-full rounded-xl border border-line bg-base p-3 font-normal"
        />
      </label>
    </Card>
  );
}
