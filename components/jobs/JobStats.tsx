"use client";

import Link from "next/link";
import { useSync } from "@/components/SyncProvider";
import { formatMinutes, type Job, type Participant } from "@/lib/jobs/logic";
import { BAND, contribution, easing, household, suitableFor, type Person } from "@/lib/jobs/stats";
import { syncEngine } from "@/lib/sync/client";
import { useMe, useRows } from "@/lib/sync/hooks";

const EASE_DAYS = 7;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Nairobi" });

// The house's last 14 days of jobs: each person's time given against an equal share, in family
// order. Under the share: jobs that suit you. Well over it: the choice to take it easy.
// Nobody is made to do anything; this only suggests.
export function JobStats({ showMine = true }: { showMine?: boolean }) {
  const { syncNow } = useSync();
  const me = useMe() as (Person & { id: string }) | undefined;
  const jobs = (useRows<Job & { id: string }>("jobs") ?? []) as Job[];
  const parts = (useRows<Participant & { id: string }>("job_participants") ?? []) as Participant[];
  const people = (useRows<Person & { id: string }>("members") ?? []) as Person[];

  const c = contribution(jobs, parts, people);
  const names = new Map(household(people).map((p) => [p.id, p.name]));
  const scale = Math.max(c.fair * 1.6, ...c.lines.map((l) => l.minutes), 1);
  const mine = c.lines.find((l) => l.memberId === me?.id);
  const meNow = people.find((p) => p.id === me?.id);
  const easingNow = easing(meNow);
  const suitable = meNow ? suitableFor(jobs, parts, meNow).slice(0, 3) : [];

  async function ease(until: string | null) {
    if (!me) return;
    await syncEngine().queue("members", "update", { id: me.id, ease_until: until });
    void syncNow();
  }

  return (
    <section aria-labelledby="house-jobs" className="rounded-xl bg-raised p-4 shadow-[0_1px_3px_rgba(10,51,35,.10)]">
      <h2 id="house-jobs" className="font-display text-xl">
        Jobs: the last 2 weeks
      </h2>
      <p className="text-sm text-muted tabular">
        {c.jobsDone === 1 ? "1 job done" : `${c.jobsDone} jobs done`} · {formatMinutes(c.houseMinutes)} of work
        {c.enough && ` · an equal share is about ${formatMinutes(Math.round(c.fair))} each`}
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {c.lines.map((l) => (
          <li key={l.memberId}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-bold">{names.get(l.memberId)}</span>
              <span className="tabular">
                {l.minutes ? formatMinutes(l.minutes) : "–"}
                {l.cooked > 0 && ` · cooked ${l.cooked}×`}
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold ${BAND[l.band].cls}`}>{BAND[l.band].word}</span>
              </span>
            </div>
            <div className="relative mt-1 h-2.5 overflow-hidden rounded-full bg-base" aria-hidden="true">
              <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (l.minutes / scale) * 100)}%` }} />
              {c.enough && <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${(c.fair / scale) * 100}%` }} />}
            </div>
          </li>
        ))}
      </ul>
      {c.enough ? (
        <p className="mt-2 text-xs text-muted">The line marks an equal share. People who are away aren&apos;t compared.</p>
      ) : (
        <p className="mt-2 text-sm text-muted">Once the house has finished about 2 hours of jobs, this shows how the work is shared.</p>
      )}

      {showMine && me && mine && (
        <div className="mt-3 rounded-xl bg-base p-3">
          {easingNow ? (
            <>
              <p>
                You&apos;re taking it easy until {day(meNow!.ease_until!)}. No jobs are suggested to you until then.
              </p>
              <button type="button" onClick={() => ease(null)} className="mt-2 min-h-12 rounded-xl border border-line px-4 font-bold">
                Back to normal
              </button>
            </>
          ) : mine.band === "lot" ? (
            <>
              <p>
                <strong>You&apos;ve given a lot</strong> ({formatMinutes(mine.minutes)} in 2 weeks). Want to take it easy this week? Others get the suggestions instead. You can still join anything.
              </p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => ease(new Date(Date.now() + EASE_DAYS * 86400_000).toISOString())} className="min-h-12 rounded-xl bg-brand px-4 font-bold text-brand-contrast">
                  Take it easy for a week
                </button>
              </div>
            </>
          ) : suitable.length ? (
            <>
              <p>
                <strong>{mine.band === "room" ? "Room to help: jobs that suit you now" : "Jobs that suit you now"}</strong>
              </p>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {suitable.map((j) => (
                  <li key={j.id}>
                    {j.title} <span className="text-muted">({formatMinutes(j.duration_min)})</span>
                  </li>
                ))}
              </ul>
              <Link href="/jobs" className="mt-2 inline-flex min-h-12 items-center rounded-xl bg-brand px-4 font-bold text-brand-contrast">
                Open Jobs
              </Link>
            </>
          ) : (
            <p className="text-sm text-muted">Nothing open that suits you right now.</p>
          )}
        </div>
      )}
    </section>
  );
}
