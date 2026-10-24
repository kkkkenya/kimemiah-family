// Family meetings: what was decided last time and whether it happened, and the summary for
// Peter. Pure, so it's tested.

export type MeetingRow = { id: string; held_on: string | null; host_id: string | null; notes?: string | null; status: "planned" | "held"; attendees?: string[] | null; start_time?: string | null; deleted_at?: string | null };
export type DecisionRow = { id: string; meeting_id: string | null; decided_on: string; text: string; job_id: string | null; owner_id?: string | null; due_on?: string | null; done_at?: string | null; deleted_at?: string | null };
type JobLite = { id: string; done_at?: string | null; deleted_at?: string | null };

export type FollowUp = DecisionRow & { state: "done" | "late" | "open" };

/** A decision is done when it's marked done, or when the job made from it is done. */
export function decisionState(d: DecisionRow, jobs: JobLite[], today: string): FollowUp["state"] {
  const job = d.job_id ? jobs.find((j) => j.id === d.job_id) : undefined;
  if (d.done_at || job?.done_at) return "done";
  if (d.due_on && d.due_on < today) return "late";
  return "open";
}

/**
 * "Last time we decided…": every decision from earlier meetings that isn't done yet, plus the
 * ones from the last meeting even if done (so the family sees them ticked off). Late first.
 */
export function followUps(meetings: MeetingRow[], decisions: DecisionRow[], jobs: JobLite[], today: string): FollowUp[] {
  const held = meetings.filter((m) => m.status === "held" && !m.deleted_at).sort((a, b) => (b.held_on ?? "").localeCompare(a.held_on ?? ""));
  const last = held[0]?.id;
  const heldIds = new Set(held.map((m) => m.id));
  const order = { late: 0, open: 1, done: 2 };
  return decisions
    .filter((d) => !d.deleted_at && d.meeting_id && heldIds.has(d.meeting_id))
    .map((d) => ({ ...d, state: decisionState(d, jobs, today) }))
    .filter((d) => d.state !== "done" || d.meeting_id === last)
    .sort((a, b) => order[a.state] - order[b.state] || (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999"));
}

const day = (d: string) => new Date(`${d}T09:00:00Z`).toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "short" });
const short = (d: string) => new Date(`${d}T09:00:00Z`).toLocaleDateString("en-KE", { day: "numeric", month: "short" });

/** Peter's WhatsApp summary of a meeting: who came, what was decided, who owns what, and the notes. */
export function meetingSummary(m: MeetingRow, decisions: DecisionRow[], nameOf: (id: string) => string, followed: FollowUp[] = []): string {
  const lines = [`Kimemiah family meeting, ${m.held_on ? day(m.held_on) : "today"}`];
  const came = (m.attendees ?? []).map(nameOf).filter(Boolean);
  if (m.host_id) lines.push(`Hosted by ${nameOf(m.host_id)}`);
  if (came.length) lines.push(`There: ${came.join(", ")}`);
  const mine = decisions.filter((d) => d.meeting_id === m.id && !d.deleted_at);
  if (mine.length) {
    lines.push("", "Decided:");
    for (const d of mine) lines.push(`- ${d.text}${d.owner_id ? ` (${nameOf(d.owner_id)}${d.due_on ? `, by ${short(d.due_on)}` : ""})` : ""}`);
  }
  const done = followed.filter((f) => f.state === "done");
  const notDone = followed.filter((f) => f.state !== "done");
  if (done.length || notDone.length) {
    lines.push("", "From last time:");
    for (const f of done) lines.push(`- Done: ${f.text}`);
    for (const f of notDone) lines.push(`- Still to do: ${f.text}${f.owner_id ? ` (${nameOf(f.owner_id)})` : ""}`);
  }
  if (m.notes?.trim()) lines.push("", "Notes:", m.notes.trim());
  return lines.join("\n");
}
