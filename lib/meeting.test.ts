import { describe, expect, it } from "vitest";
import { followUps, meetingSummary, type DecisionRow, type MeetingRow } from "./meeting";
import { planHouseAlerts } from "./push/house";

const names: Record<string, string> = { greg: "Greg", vinnie: "Vinnie", peter: "Peter", juliet: "Juliet" };
const nameOf = (id: string) => names[id] ?? id;
const meetings: MeetingRow[] = [
  { id: "m1", held_on: "2026-10-11", host_id: "juliet", status: "held" },
  { id: "m2", held_on: "2026-10-25", host_id: "greg", status: "held", attendees: ["greg", "vinnie", "peter"], notes: "Water tank leaks again." },
  { id: "m3", held_on: "2026-11-08", host_id: "vinnie", status: "planned" },
];
const d = (id: string, o: Partial<DecisionRow>): DecisionRow => ({ id, meeting_id: "m2", decided_on: "2026-10-25", text: id, job_id: null, ...o });

describe("follow-ups", () => {
  const decisions = [
    d("Fix the tank", { owner_id: "vinnie", due_on: "2026-10-30" }),
    d("Cut takeaway to once a week", { done_at: "2026-10-27T10:00:00Z" }),
    d("Paint the gate", { meeting_id: "m1", job_id: "gate" }),
    d("Old and done", { meeting_id: "m1", done_at: "2026-10-12T10:00:00Z" }),
    d("Next one", { meeting_id: "m3" }),
  ];
  it("shows what's not done, late first, plus last meeting's done ones", () => {
    const f = followUps(meetings, decisions, [{ id: "gate" }], "2026-11-01");
    expect(f.map((x) => [x.text, x.state])).toEqual([
      ["Fix the tank", "late"],
      ["Paint the gate", "open"],
      ["Cut takeaway to once a week", "done"],
    ]);
  });
  it("counts a decision done when its job is done", () => {
    expect(followUps(meetings, decisions, [{ id: "gate", done_at: "2026-10-20T10:00:00Z" }], "2026-11-01").map((x) => x.text)).not.toContain("Paint the gate");
  });
});

describe("Peter's summary", () => {
  it("says who came, what was decided and by whom, what's left from last time, and the notes", () => {
    const t = meetingSummary(meetings[1], [d("Fix the tank", { owner_id: "vinnie", due_on: "2026-10-30" })], nameOf, [{ ...d("Paint the gate", {}), state: "open", owner_id: "greg" }]);
    expect(t).toContain("Hosted by Greg");
    expect(t).toContain("There: Greg, Vinnie, Peter");
    expect(t).toContain("- Fix the tank (Vinnie, by 30 Oct)");
    expect(t).toContain("- Still to do: Paint the gate (Greg)");
    expect(t).toContain("Water tank leaks again.");
  });
});

describe("meeting reminders", () => {
  const people = [{ id: "greg", name: "Greg" }, { id: "vinnie", name: "Vinnie" }, { id: "peter", name: "Peter", is_remote: true }];
  const planned = [{ id: "m3", held_on: "2026-11-08", host_id: "vinnie", status: "planned", start_time: "17:00" }];
  it("tells the host the evening before", () => {
    const a = planHouseAlerts([], [], [], [], people, Date.parse("2026-11-07T16:00:00Z"), planned, () => 4);
    expect(a.map((x) => [x.key, x.to])).toEqual([["meet-host:m3", ["vinnie"]]]);
    expect(a[0].body).toContain("4 on the agenda");
  });
  it("tells everyone, Peter too, in the hour before it starts", () => {
    const a = planHouseAlerts([], [], [], [], people, Date.parse("2026-11-08T13:20:00Z"), planned); // 16:20 Nairobi
    expect(a.map((x) => [x.key, x.to])).toEqual([["meet-soon:m3", ["greg", "vinnie", "peter"]]]);
    expect(planHouseAlerts([], [], [], [], people, Date.parse("2026-11-08T11:00:00Z"), planned)).toEqual([]);
  });
});
