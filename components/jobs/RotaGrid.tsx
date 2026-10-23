"use client";

import { useSync } from "@/components/SyncProvider";
import { syncEngine } from "@/lib/sync/client";
import { useRows, type Member } from "@/lib/sync/hooks";
import type { Row } from "@/lib/sync/tables";

type Cell = Row & { weekday: number; chore: string; member_id: string | null };

// Same chores as rota_chores() in migration 0012.
const CHORES = [
  { id: "dishes", label: "Dishes", hint: "40 min, by 21:00" },
  { id: "cook", label: "Cook supper", hint: "1 h 30 min, by 19:30" },
  { id: "dog", label: "Feed the dog", hint: "15 min, by 18:00" },
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// The weekly sign-up grid, filled in together at the meeting. Each day the app posts these
// jobs already taken by whoever signed up; reminders and rescue work as for any job.
export function RotaGrid() {
  const { syncNow } = useSync();
  const cells = useRows<Cell>("job_rota") ?? [];
  const people = (useRows<Member>("members") ?? []).filter((m) => m.active !== false && !m.is_remote).sort((a, b) => a.sort - b.sort);
  const cellFor = (day: number, chore: string) => cells.find((c) => c.weekday === day && c.chore === chore);

  async function assign(day: number, chore: string, memberId: string) {
    const existing = cellFor(day, chore);
    const member_id = memberId || null;
    if (existing) await syncEngine().queue("job_rota", "update", { id: existing.id, member_id });
    else await syncEngine().queue("job_rota", "insert", { id: crypto.randomUUID(), weekday: day, chore, member_id });
    void syncNow();
  }

  return (
    <section aria-labelledby="rota" className="rounded-2xl bg-raised p-4 border border-line">
      <h2 id="rota" className="font-display text-xl">
        Weekly sign-up
      </h2>
      <p className="text-sm text-muted">Pick your days together. Each day the job appears already yours, with reminders like any job.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-2">
                Day
              </th>
              {CHORES.map((c) => (
                <th key={c.id} scope="col" className="py-2 pr-2">
                  {c.label}
                  <span className="block font-normal text-muted">{c.hint}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((d, i) => (
              <tr key={d} className="border-b border-line last:border-0">
                <th scope="row" className="py-2 pr-2 font-bold">
                  {d}
                </th>
                {CHORES.map((c) => (
                  <td key={c.id} className="py-1 pr-2">
                    <select
                      aria-label={`${c.label} on ${d}`}
                      value={cellFor(i + 1, c.id)?.member_id ?? ""}
                      onChange={(e) => assign(i + 1, c.id, e.target.value)}
                      className="min-h-12 w-full min-w-24 rounded-xl border border-line bg-base px-2"
                    >
                      <option value="">Open</option>
                      {people.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
