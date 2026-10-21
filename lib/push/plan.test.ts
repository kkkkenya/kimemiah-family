import { describe, expect, it } from "vitest";
import { groupByPerson, isQuiet, planAlerts, type PushJob, type PushMember, type PushPart } from "./plan";

const NOW = Date.parse("2026-10-22T09:00:00Z"); // 12:00 Nairobi
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();

const members: PushMember[] = [
  { id: "juliet", name: "Juliet", sort: 1, presence: "at_home" },
  { id: "peter", name: "Peter", sort: 2, presence: "away", is_remote: true },
  { id: "wanini", name: "Wanini", sort: 3, presence: "at_home", no_heavy: true },
  { id: "daniel", name: "Daniel", sort: 4, presence: "out" },
  { id: "vinnie", name: "Vinnie", sort: 5, presence: "at_home" },
  { id: "greg", name: "Greg", sort: 6, presence: "at_home" },
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
    expect(g.get("vinnie")).toEqual({ title: "Water is back!", body: "x", tag: "urgent-a", url: "/jobs" });
    expect(g.get("greg")).toEqual({ title: "2 job updates", body: "Water is back! · Still yours: Dishes", tag: "jobs", url: "/jobs" });
  });
});

describe("performance alerts", () => {
  // Two weeks: Greg 6 h, Vinnie 2 h, Juliet 1 h 30, Wanini nothing (Daniel is out; Peter lives away).
  const history: PushJob[] = [
    job({ id: "fence", duration_min: 360, done_at: ago(48) }),
    job({ id: "dog", duration_min: 120, done_at: ago(30) }),
    job({ id: "cook", duration_min: 90, done_at: ago(20) }),
  ];
  const done = [part({ job_id: "fence", member_id: "greg" }), part({ job_id: "dog", member_id: "vinnie" }), part({ job_id: "cook", member_id: "juliet" })];

  it("suggest a new job to whoever has given least, never to the poster", () => {
    const sweep = job({ id: "sweep", actor_id: "juliet" });
    const a = planAlerts([sweep], done, members, NOW, history).find((x) => x.kind === "suggested");
    expect(a).toMatchObject({ to: ["wanini"], title: "Suggested for you: sweep" });
    // Heavy work isn't suggested to Wanini; Juliet (1 h 30) is next but posted it, so nobody is sent it.
    const heavy = job({ id: "slash", strain: "heavy", actor_id: "juliet" });
    expect(planAlerts([heavy], done, members, NOW, history).find((x) => x.kind === "suggested")?.to).toEqual([]);
  });

  it("offer the person doing a lot a week off, once a week", () => {
    const ease = planAlerts([], done, members, NOW, history).filter((x) => x.kind === "ease");
    expect(ease.map((x) => x.to)).toEqual([["greg"]]);
    const offered = members.map((m) => (m.id === "greg" ? { ...m, ease_offered_at: ago(24) } : m));
    expect(planAlerts([], done, offered, NOW, history).filter((x) => x.kind === "ease")).toEqual([]);
    const easing = members.map((m) => (m.id === "greg" ? { ...m, ease_until: ago(-48) } : m));
    expect(planAlerts([], done, easing, NOW, history).filter((x) => x.kind === "ease")).toEqual([]);
  });

  it("tell someone with room to help which jobs suit them, once a week", () => {
    const open = [job({ id: "feed", title: "Feed the dog", strain: "light", suggested_notified_at: ago(1) })];
    const nudge = planAlerts(open, done, members, NOW, history).filter((x) => x.kind === "nudge");
    expect(nudge).toMatchObject([{ to: ["wanini"], title: "A job that suits you", body: "Feed the dog. Joining is up to you." }]);
    const nudged = members.map((m) => (m.id === "wanini" ? { ...m, nudged_at: ago(48) } : m));
    expect(planAlerts(open, done, nudged, NOW, history).filter((x) => x.kind === "nudge")).toEqual([]);
  });
});
