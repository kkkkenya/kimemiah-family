"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { dueReminders, jobStatus, workers, type Job, type Participant } from "@/lib/jobs/logic";
import { useMe, useRows } from "@/lib/sync/hooks";

const SHOWN_KEY = "kimemiah-job-reminded";

function readShown(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SHOWN_KEY) ?? "{}");
  } catch {
    return {};
  }
}

// "Still yours" reminders every 2 hours (07:00-21:00) for jobs you took, and jobs that need
// rescuing. In the app for now; push alerts with the same rule come in Phase 7.
export function JobAlerts({ link = false }: { link?: boolean }) {
  const me = useMe();
  const jobs = (useRows<Job & { id: string }>("jobs") ?? []) as Job[];
  const parts = (useRows<Participant & { id: string }>("job_participants") ?? []) as Participant[];
  const [shown, setShown] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setShown(readShown());
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const presence = (me as { presence?: string } | undefined)?.presence ?? "at_home";
  const reminders = dueReminders(jobs, parts, me?.id, now, shown, presence);
  const rescue = jobs.filter((j) => !j.deleted_at && jobStatus(j, parts, now) === "overdue" && !workers(j.id, parts).some((p) => p.member_id === me?.id));
  if (!reminders.length && !rescue.length) return null;

  function snooze(id: string) {
    const next = { ...readShown(), [id]: Date.now() };
    try {
      localStorage.setItem(SHOWN_KEY, JSON.stringify(next));
    } catch {}
    setShown(next);
  }

  return (
    <div className="flex flex-col gap-2">
      {reminders.map((j) => {
        const share = workers(j.id, parts).find((p) => p.member_id === me?.id)?.effort_pct;
        return (
          <section key={j.id} role="status" className="rounded-xl border-2 border-brand bg-raised p-4">
            <p>
              <strong>Still yours:</strong> {j.title}
              {share ? ` (your ${share}%)` : ""}. Tap Done on the Jobs tab when it&apos;s finished, or ask someone to team up.
            </p>
            <div className="mt-2 flex gap-2">
              {link && (
                <Link href="/jobs" className="flex min-h-12 items-center rounded-xl bg-brand px-4 font-bold text-brand-contrast">
                  Open Jobs
                </Link>
              )}
              <button type="button" onClick={() => snooze(j.id)} className="min-h-12 rounded-xl border border-line px-4 font-bold">
                Still on it
              </button>
            </div>
          </section>
        );
      })}
      {rescue.length > 0 && (
        <section className="rounded-xl bg-low-bg p-4 text-low-fg">
          <p>
            <strong>⚠️ {rescue.length === 1 ? "1 job needs" : `${rescue.length} jobs need`} rescuing:</strong> {rescue.map((j) => j.title).join(", ")}.
          </p>
          {link && (
            <Link href="/jobs" className="mt-2 inline-flex min-h-12 items-center font-bold underline underline-offset-4">
              See who can help
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
