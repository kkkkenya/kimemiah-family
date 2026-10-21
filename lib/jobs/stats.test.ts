import { describe, expect, it } from "vitest";
import type { Job, Participant } from "./logic";
import { contribution, suggestFor, suitableFor, suits, type Person } from "./stats";

const NOW = Date.parse("2026-10-22T09:00:00Z");
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();

const people: Person[] = [
  { id: "juliet", name: "Juliet", sort: 1, presence: "at_home" },
  { id: "peter", name: "Peter", sort: 2, is_remote: true, presence: "away" },
  { id: "wanini", name: "Wanini", sort: 3, presence: "at_home", no_heavy: true },
  { id: "daniel", name: "Daniel", sort: 4, presence: "at_home" },
  { id: "vinnie", name: "Vinnie", sort: 5, presence: "at_home" },
  { id: "greg", name: "Greg", sort: 6, presence: "at_home" },
];
const job = (o: Partial<Job> & { id: string }): Job => ({ title: o.id, category: "house_cleaning", strain: "medium", duration_min: 60, people_needed: 1, created_at: ago(1), ...o });
const part = (job_id: string, member_id: string, effort_pct = 100, status: Participant["status"] = "active"): Participant => ({ id: `${job_id}-${member_id}`, job_id, member_id, effort_pct, status, created_at: ago(30) });

// Two weeks: Greg 4 h, Vinnie 2 h 30, Juliet 1 h 30 of cooking, Wanini 1 h, Daniel nothing.
const done = [
  job({ id: "fence", duration_min: 240, done_at: ago(48) }),
  job({ id: "dog", duration_min: 75, people_needed: 2, done_at: ago(24) }),
  job({ id: "cook", category: "cooking_house", duration_min: 90, done_at: ago(20) }),
  job({ id: "dishes", duration_min: 60, done_at: ago(10) }),
  job({ id: "old", duration_min: 600, done_at: ago(24 * 20) }),
];
const ps = [
  part("fence", "greg"),
  part("dog", "vinnie", 100),
  part("dog", "greg", 0, "unable"),
  part("cook", "juliet"),
  part("dishes", "wanini"),
  part("old", "daniel"),
];

describe("contribution", () => {
  const c = contribution(done, ps, people, NOW);
  it("adds up time given in the last 14 days, cooking included", () => {
    expect(c.lines.map((l) => [l.memberId, l.minutes, l.jobsDone, l.cooked])).toEqual([
      ["juliet", 90, 1, 1],
      ["wanini", 60, 1, 0],
      ["daniel", 0, 0, 0], // his 10 h job was 20 days ago
      ["vinnie", 150, 1, 0],
      ["greg", 240, 1, 0], // the dog wash he couldn't finish doesn't count
    ]);
    expect(c.houseMinutes).toBe(540);
    expect(c.fair).toBe(108); // 540 min over 5 people at home; Peter isn't counted
  });

  it("labels each person against an equal share", () => {
    expect(Object.fromEntries(c.lines.map((l) => [l.memberId, l.band]))).toEqual({
      juliet: "fair",
      wanini: "fair",
      daniel: "room",
      vinnie: "fair",
      greg: "lot",
    });
  });

  it("doesn't judge anyone until the house has 2 h of finished work", () => {
    const early = contribution([job({ id: "x", duration_min: 30, done_at: ago(1) })], [part("x", "greg")], people, NOW);
    expect(early.enough).toBe(false);
    expect(early.lines.every((l) => l.band === "new")).toBe(true);
  });

  it("leaves people who are away out of the comparison", () => {
    const away = contribution(done, ps, people.map((p) => (p.id === "daniel" ? { ...p, presence: "away" } : p)), NOW);
    expect(away.lines.find((l) => l.memberId === "daniel")?.band).toBe("away");
    expect(away.fair).toBe(135); // 540 over the 4 at home
  });
});

describe("suggestions", () => {
  const c = contribution(done, ps, people, NOW);
  it("suggest whoever has given least, among people it suits", () => {
    const sweep = job({ id: "sweep" });
    expect(suggestFor(sweep, ps, people, c.lines, c.enough, NOW)).toBe("daniel");
  });

  it("skip people who are out, easing off, or said no heavy jobs", () => {
    const heavy = job({ id: "slash", strain: "heavy" });
    const list = people.map((p) => (p.id === "daniel" ? { ...p, presence: "out" } : p.id === "juliet" ? { ...p, ease_until: ago(-24) } : p));
    // Daniel is out, Juliet is easing off, Wanini doesn't do heavy: Vinnie (2 h 30) is next.
    expect(suggestFor(heavy, ps, list, c.lines, c.enough, NOW)).toBe("vinnie");
    expect(suits(heavy, ps, list.find((p) => p.id === "wanini")!, NOW)).toBe(false);
  });

  it("make no suggestion without enough history or when it's a tie", () => {
    expect(suggestFor(job({ id: "a" }), ps, people, c.lines, false, NOW)).toBeNull();
    const tied = c.lines.map((l) => ({ ...l, minutes: 0 }));
    expect(suggestFor(job({ id: "a" }), ps, people, tied, true, NOW)).toBeNull();
  });

  it("list the open jobs that suit me", () => {
    const open = [job({ id: "heavy", strain: "heavy", due_at: ago(-2) }), job({ id: "light", strain: "light", due_at: ago(-1) }), job({ id: "taken" })];
    const mine = [...ps, part("taken", "vinnie")];
    expect(suitableFor(open, mine, people.find((p) => p.id === "wanini")!, NOW).map((j) => j.id)).toEqual(["light"]);
    expect(suitableFor(open, mine, people.find((p) => p.id === "daniel")!, NOW).map((j) => j.id)).toEqual(["light", "heavy"]);
  });
});
