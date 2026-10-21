"use client";

// Joining, leaving and rescuing a job are checked on the server (first come, first served),
// so they need signal. Posting, finishing and Asante go through the offline outbox.

import { supabase } from "@/lib/supabase/client";
import { localDB, syncEngine } from "@/lib/sync/client";
import type { Row } from "@/lib/sync/tables";
import type { Job } from "./logic";
import type { NextStage, Template } from "./templates";

async function call(fn: string, args: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) return error.message.includes("Failed to fetch") ? "That needs signal. Try again when you're connected." : error.message;
  // Show the change straight away; the next sync brings everything else.
  if (data) await localDB().rows("job_participants").put(data as Row);
  return null;
}

export const joinJob = (jobId: string, pct: number, note?: string) => call("join_job", { p_job: jobId, p_pct: pct, p_note: note ?? null });
export const leaveJob = (jobId: string) => call("leave_job", { p_job: jobId });
export const rescueJob = (jobId: string, pct: number | null, takeOver: boolean) =>
  call("rescue_job", { p_job: jobId, p_pct: pct, p_take_over: takeOver });

// ---------------------------------------------------------------- dates (Nairobi)

const nairobiDay = (t: number) => new Date(t + 3 * 3600_000).toISOString().slice(0, 10);
const endOfDay = (day: string) => `${day}T18:00:00.000Z`; // 21:00 in Nairobi

/** Today's end (21:00), or tomorrow's if it's already later than that. */
export function endOfToday(now = Date.now()): string {
  const today = endOfDay(nairobiDay(now));
  return Date.parse(today) > now ? today : endOfDay(nairobiDay(now + 86400_000));
}
export const dayPlus = (days: number, now = Date.now()) => nairobiDay(now + days * 86400_000);
export const dueOnDay = (day: string) => endOfDay(day);

// ---------------------------------------------------------------- posting

export type NewJob = {
  title: string;
  notes?: string | null;
  category: string;
  strain: Job["strain"];
  duration_min: number;
  people_needed: number;
  urgent?: boolean;
  due_at: string;
  repeat?: string;
  requires_funds?: boolean;
  estimated_cost_kes?: number | null;
  planned_for?: string | null;
  next_stage?: NextStage | null;
  template_key?: string | null;
};

export async function postJob(j: NewJob): Promise<string> {
  const id = crypto.randomUUID();
  await syncEngine().queue("jobs", "insert", {
    id,
    kind: "job",
    title: j.title.trim(),
    notes: j.notes?.trim() || null,
    category: j.category,
    strain: j.strain,
    duration_min: j.duration_min,
    people_needed: j.people_needed,
    urgent: !!j.urgent,
    due_at: j.due_at,
    repeat: j.repeat ?? "none",
    requires_funds: !!j.requires_funds,
    estimated_cost_kes: j.requires_funds ? (j.estimated_cost_kes ?? null) : null,
    funds_status: j.requires_funds ? "discussing" : "not_needed",
    planned_for: j.requires_funds ? (j.planned_for ?? null) : null,
    next_stage: j.next_stage ?? null,
    template_key: j.template_key ?? null,
    done_at: null,
    done_by: null,
  });
  return id;
}

export function fromTemplate(t: Template, now = Date.now(), learnedMinutes?: number): NewJob {
  const planned = t.requires_funds ? dayPlus(t.daysAhead ?? 3, now) : null;
  return {
    title: t.title,
    category: t.category,
    strain: t.strain,
    duration_min: learnedMinutes ?? t.duration_min,
    template_key: t.id,
    people_needed: t.people_needed,
    urgent: t.urgent,
    due_at: planned ? dueOnDay(planned) : t.dueInHours ? new Date(now + t.dueInHours * 3600_000).toISOString() : endOfToday(now),
    repeat: t.repeat,
    requires_funds: t.requires_funds,
    planned_for: planned,
    next_stage: t.next_stage ?? null,
  };
}

export async function updateJob(id: string, change: Partial<Job>) {
  await syncEngine().queue("jobs", "update", { id, ...change });
}

export async function sendThanks(jobId: string, to: string) {
  await syncEngine().queue("thanks", "insert", { id: crypto.randomUUID(), target_type: "job", target_id: jobId, to_member: to, message: "Asante" });
}
