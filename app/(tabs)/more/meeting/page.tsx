"use client";

import { Card, Screen } from "@/components/Screen";
import { RotaGrid } from "@/components/jobs/RotaGrid";
import { forAgenda, formatMinutes, meetingSummary, waitingDays, type Job, type MealSlot, type Participant } from "@/lib/jobs/logic";
import { useRows, type Member } from "@/lib/sync/hooks";
import type { Row } from "@/lib/sync/tables";

// The facts for the family meeting: what each person did for the house in the last 14 days.
// Shown only here, in family order, never ranked.
export default function Page() {
  const jobs = (useRows<Job & { id: string }>("jobs") ?? []) as Job[];
  const parts = (useRows<Participant & { id: string }>("job_participants") ?? []) as Participant[];
  const meals = (useRows<MealSlot & { id: string }>("meal_slots") ?? []) as MealSlot[];
  const members = (useRows<Member>("members") ?? []).filter((m) => m.active !== false && !m.is_remote).sort((a, b) => a.sort - b.sort);

  const settings = useRows<Row & { volunteer_after_days?: number }>("settings") ?? [];
  const after = settings[0]?.volunteer_after_days ?? 3;
  const waiting = forAgenda(jobs, parts, after);
  const s = meetingSummary(jobs, parts, meals, members.map((m) => m.id));
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "";

  return (
    <Screen title="Meeting" back="/more">
      <Card>
        <h2 className="font-display text-xl">On the agenda</h2>
        {waiting.length ? (
          <>
            <p className="text-sm text-muted">Jobs nobody has taken for {after} days or more. About the job, not about anyone.</p>
            <ul className="mt-2 list-disc pl-5">
              {waiting.map((j) => (
                <li key={j.id}>
                  {j.title} <span className="text-sm text-muted">(waiting {waitingDays(j, parts)} days)</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-muted">No job has been waiting {after} days. Nice.</p>
        )}
      </Card>
      <RotaGrid />
      <Card>
        <h2 className="font-display text-xl">Last 14 days for the house</h2>
        <p className="text-sm text-muted">
          {s.jobsDone === 1 ? "1 job done" : `${s.jobsDone} jobs done`}
          {s.rescued ? ` · ${s.rescued} finished by someone who stepped in` : ""}. Meals count only when cooked for the whole house.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm tabular">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-2">
                  Person
                </th>
                <th scope="col" className="py-2 pr-2">
                  Jobs
                </th>
                <th scope="col" className="py-2 pr-2">
                  Time given
                </th>
                <th scope="col" className="py-2 pr-2">
                  Stepped in
                </th>
                <th scope="col" className="py-2">
                  House meals
                </th>
              </tr>
            </thead>
            <tbody>
              {s.lines.map((l) => (
                <tr key={l.memberId} className="border-b border-line last:border-0">
                  <th scope="row" className="py-2 pr-2 font-bold">
                    {nameOf(l.memberId)}
                  </th>
                  <td className="py-2 pr-2">{l.jobsDone}</td>
                  <td className="py-2 pr-2">{l.minutes ? formatMinutes(l.minutes) : "–"}</td>
                  <td className="py-2 pr-2">{l.rescues}</td>
                  <td className="py-2">{l.meals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-muted">Use it to share out the coming week: who takes which light, medium and heavy jobs.</p>
      </Card>
    </Screen>
  );
}
