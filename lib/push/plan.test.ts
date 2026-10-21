import { describe, expect, it } from "vitest";
import { groupByPerson, isQuiet, planAlerts, type PushJob, type PushMember, type PushPart } from "./plan";

const NOW = Date.parse("2026-10-22T09:00:00Z"); // 12:00 Nairobi
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();

const members: PushMember[] = [
  { id: "juliet", name: "Juliet", presence: "at_home" },
  { id: "peter", name: "Peter", presence: "away", is_remote: true },
  { id: "wanini", name: "Wanini", presence: "at_home" },
  { id: "daniel", name: "Daniel", presence: "out" },
  { id: "vinnie", name: "Vinnie", presence: "at_home" },
  { id: "greg", name: "Greg", presence: "at_home" },
];
const job = (o: Partial<PushJob> & { id: string }): PushJob => ({
  title: o.id,
  category: "house_cleaning",
  strain: "medium",
  duration_min: 60,
  people_needed: 1,
  created_at: ago(0.1),
  ...o,
});
const part = (o: Partial<PushPart> & { job_id: string; member_id: string }): PushPart => ({
  id: `${o.job_id}-${o.member_id}`,
  effort_pct: 100,
  status: "active",
  created_at: ago(0.5),
  ...o,
});

describe("urgent jobs", () => {
  it("go to everyone at home except whoever posted, once", () => {
    const water = job({ id: "water", title: "Water is back!", urgent: true, actor_id: "greg" });
    const [a] = planAlerts([water], [], members, NOW);
    expect(a).toMatchObject({ kind: "urgent", to: ["juliet", "wanini", "vinnie"], body: "Greg posted this. Can you help?" });
    expect(planAlerts([{ ...water, urgent_notified_at: ago(0) }], [], members, NOW)).toEqual([]);
  });

  it("older than an hour: marked, not sent", () => {
    const [a] = planAlerts([job({ id: "w", urgent: true, created_at: ago(2) })], [], members, NOW);
    expect(a.to).toEqual([]);
  });
});

describe("team jobs", () => {
  it("tell the first person when the last share comes in", () => {
    const dog = job({ id: "dog", people_needed: 2 });
    const ps = [part({ job_id: "dog", member_id: "greg", effort_pct: 60, created_at: ago(0.5) }), part({ job_id: "dog", member_id: "vinnie", effort_pct: 40, created_at: ago(0.1) })];
    const covered = planAlerts([dog], ps, members, NOW).find((a) => a.kind === "covered");
    expect(covered).toMatchObject({ to: ["greg"], body: "Vinnie joined. Everyone's share adds up to 100%." });
  });
});

describe("overdue and reminders", () => {
  it("tell the people on it when it's past due", () => {
    const late = job({ id: "late", due_at: ago(0.2) });
    const alerts = planAlerts([late], [part({ job_id: "late", member_id: "vinnie" })], members, NOW);
    expect(alerts.map((a) => [a.kind, a.to])).toEqual([["overdue", ["vinnie"]]]);
  });

  it("remind every 2 hours, only people at home", () => {
    const j = job({ id: "j", people_needed: 2 });
    const ps = [
      part({ job_id: "j", member_id: "greg", effort_pct: 50, created_at: ago(3) }),
      part({ job_id: "j", member_id: "daniel", effort_pct: 50, created_at: ago(3) }), // out
    ];
    const r = planAlerts([{ ...j, covered_notified_at: ago(2) }], ps, members, NOW).filter((a) => a.kind === "reminder");
    expect(r.map((a) => a.to)).toEqual([["greg"]]);
    const again = planAlerts([{ ...j, covered_notified_at: ago(2) }], ps.map((p) => ({ ...p, last_reminded_at: ago(1) })), members, NOW);
    expect(again.filter((a) => a.kind === "reminder")).toEqual([]);
  });

  it("nothing at all between 21:00 and 07:00", () => {
    const night = Date.parse("2026-10-22T19:00:00Z"); // 22:00 Nairobi
    expect(isQuiet(night)).toBe(true);
    expect(planAlerts([job({ id: "w", urgent: true, created_at: new Date(night).toISOString() })], [], members, night)).toEqual([]);
  });
});

describe("handover", () => {
  it("offers the share to whoever's at home", () => {
    const dog = job({ id: "dog", people_needed: 2 });
    const ps = [
      part({ job_id: "dog", member_id: "greg", effort_pct: 60, deleted_at: ago(0.1) }),
      part({ job_id: "dog", member_id: "vinnie", effort_pct: 40 }),
    ];
    const h = planAlerts([dog], ps, members, NOW).find((a) => a.kind === "handover");
    expect(h).toMatchObject({ to: ["juliet", "wanini"], body: "Greg handed over their 60%. Can you take it?" });
  });
});

describe("grouping", () => {
  it("one notification per person", () => {
    const g = groupByPerson([
      { kind: "urgent", jobId: "a", to: ["greg", "vinnie"], title: "Water is back!", body: "x" },
      { kind: "reminder", jobId: "b", to: ["greg"], title: "Still yours: Dishes", body: "y" },
    ]);
    expect(g.get("vinnie")).toEqual({ title: "Water is back!", body: "x", tag: "urgent-a" });
    expect(g.get("greg")).toEqual({ title: "2 job updates", body: "Water is back! · Still yours: Dishes", tag: "jobs" });
  });
});
