import { describe, expect, it } from "vitest";
import {
  coverage,
  dueReminders,
  forAgenda,
  formatMinutes,
  learnedDuration,
  waitingDays,
  jobSize,
  jobStatus,
  meantToDoIt,
  shareChoices,
  shareMinutes,
  sortBoard,
  type Job,
  type Participant,
} from "./logic";

const NOW = Date.parse("2026-10-22T09:00:00Z"); // 12:00 in Nairobi
const hrs = (h: number) => new Date(NOW + h * 3600_000).toISOString();

const job = (o: Partial<Job> & { id: string }): Job => ({ title: o.id, category: "house_cleaning", strain: "medium", duration_min: 60, people_needed: 1, ...o });
const part = (o: Partial<Participant> & { job_id: string; member_id: string; effort_pct: number }): Participant => ({
  id: `${o.job_id}-${o.member_id}`,
  status: "active",
  created_at: hrs(-3),
  ...o,
});

describe("size is time x people", () => {
  it("grows with both", () => {
    expect(jobSize({ duration_min: 20, people_needed: 1 })).toEqual({ personMinutes: 20, label: "Quick" });
    expect(jobSize({ duration_min: 45, people_needed: 2 })).toEqual({ personMinutes: 90, label: "Small" });
    expect(jobSize({ duration_min: 60, people_needed: 2 }).label).toBe("Medium");
    expect(jobSize({ duration_min: 120, people_needed: 2 }).label).toBe("Big"); // 4 hours of work
    expect(jobSize({ duration_min: 240, people_needed: 3 })).toEqual({ personMinutes: 720, label: "Big" });
  });

  it("turns a share into time", () => {
    expect(shareMinutes({ duration_min: 60, people_needed: 2 }, 40)).toBe(48);
    expect(shareMinutes({ duration_min: 30, people_needed: 1 }, 100)).toBe(30);
    expect(formatMinutes(48)).toBe("48 min");
    expect(formatMinutes(150)).toBe("2 h 30 min");
    expect(formatMinutes(120)).toBe("2 h");
  });
});

describe("status", () => {
  const dog = job({ id: "dog", people_needed: 2, due_at: hrs(4) });
  it("open, part-taken, taken", () => {
    expect(jobStatus(dog, [], NOW)).toBe("open");
    const greg = part({ job_id: "dog", member_id: "greg", effort_pct: 60 });
    expect(jobStatus(dog, [greg], NOW)).toBe("partial");
    // 100% covered but by one person: a 2-person job still needs a partner.
    expect(jobStatus(dog, [{ ...greg, effort_pct: 100 }], NOW)).toBe("partial");
    const vinnie = part({ job_id: "dog", member_id: "vinnie", effort_pct: 40 });
    expect(jobStatus(dog, [greg, vinnie], NOW)).toBe("taken");
    expect(coverage("dog", [greg, vinnie, { ...vinnie, member_id: "x", status: "unable" }])).toBe(100);
  });

  it("overdue once someone took it and the due time passed", () => {
    const late = { ...dog, due_at: hrs(-1) };
    expect(jobStatus(late, [], NOW)).toBe("open"); // nobody took it: still just open
    expect(jobStatus(late, [part({ job_id: "dog", member_id: "vinnie", effort_pct: 100 })], NOW)).toBe("overdue");
    expect(jobStatus({ ...late, done_at: hrs(-0.5) }, [], NOW)).toBe("done");
  });

  it("funded runs wait in Upcoming until money is ready and the day comes", () => {
    const run = job({ id: "run", requires_funds: true, funds_status: "discussing", planned_for: "2026-10-25" });
    expect(jobStatus(run, [], NOW)).toBe("planning");
    expect(jobStatus({ ...run, funds_status: "funds_ready" }, [], NOW)).toBe("planning"); // not the day yet
    expect(jobStatus({ ...run, funds_status: "funds_ready", planned_for: "2026-10-22" }, [], NOW)).toBe("open");
  });

  it("names who was meant to do an overdue job, not the rescuers", () => {
    const ps = [
      part({ job_id: "dog", member_id: "greg", effort_pct: 48, status: "unable" }),
      part({ job_id: "dog", member_id: "wanini", effort_pct: 20, status: "rescuer" }),
    ];
    expect(meantToDoIt("dog", ps)).toEqual(["greg"]);
  });
});

describe("share choices", () => {
  const dog = job({ id: "dog", people_needed: 2 });
  it("leave room for the partner a team job still needs", () => {
    const first = shareChoices(dog, [], "greg");
    expect(Math.max(...first.choices)).toBe(80);
    expect(first.suggested).toBe(50);
    const second = shareChoices(dog, [part({ job_id: "dog", member_id: "greg", effort_pct: 60 })], "vinnie");
    expect(second).toEqual({ choices: [20, 25, 30, 40], suggested: 40 });
  });
  it("offers 100% on a solo job and nothing when it's full", () => {
    expect(shareChoices(job({ id: "a" }), [], "me").suggested).toBe(100);
    expect(shareChoices(job({ id: "a" }), [part({ job_id: "a", member_id: "x", effort_pct: 100 })], "me").choices).toEqual([]);
  });
  it("lets me change my own share", () => {
    const mine = part({ job_id: "dog", member_id: "greg", effort_pct: 60 });
    expect(shareChoices(dog, [mine], "greg").choices).toContain(80);
  });
});

describe("board order", () => {
  it("rescues, then urgent, then team-ups needing people, then open", () => {
    const ps = [part({ job_id: "late", member_id: "v", effort_pct: 100 }), part({ job_id: "team", member_id: "g", effort_pct: 50 })];
    const jobs = [
      job({ id: "open", due_at: hrs(2) }),
      job({ id: "team", people_needed: 2, due_at: hrs(5) }),
      job({ id: "water", urgent: true, due_at: hrs(3) }),
      job({ id: "late", due_at: hrs(-1) }),
    ];
    expect(sortBoard(jobs, ps, NOW).map((j) => j.id)).toEqual(["late", "water", "team", "open"]);
  });
});

describe("reminders", () => {
  const ps = [part({ job_id: "dog", member_id: "greg", effort_pct: 100, created_at: hrs(-3) })];
  const jobs = [job({ id: "dog" })];
  it("every 2 hours while it's mine and not done", () => {
    expect(dueReminders(jobs, ps, "greg", NOW).map((j) => j.id)).toEqual(["dog"]);
    expect(dueReminders(jobs, ps, "greg", NOW, { dog: NOW - 3600_000 })).toEqual([]); // shown an hour ago
    expect(dueReminders(jobs, ps, "vinnie", NOW)).toEqual([]);
    expect(dueReminders([{ ...jobs[0], done_at: hrs(-1) }], ps, "greg", NOW)).toEqual([]);
  });
  it("pause while I'm out or away", () => {
    expect(dueReminders(jobs, ps, "greg", NOW, {}, "out")).toEqual([]);
    expect(dueReminders(jobs, ps, "greg", NOW, {}, "away")).toEqual([]);
    expect(dueReminders(jobs, ps, "greg", NOW, {}, "at_home")).toHaveLength(1);
  });

  it("never between 21:00 and 07:00 Nairobi time", () => {
    const night = Date.parse("2026-10-22T19:30:00Z"); // 22:30 in Nairobi
    expect(dueReminders(jobs, ps, "greg", night)).toEqual([]);
  });
});

describe("learned times", () => {
  const run = (id: string, minutes: number, daysAgo: number) =>
    job({ id, template_key: "dog", started_at: hrs(-24 * daysAgo), done_at: new Date(Date.parse(hrs(-24 * daysAgo)) + minutes * 60_000).toISOString() });

  it("needs 2 real times, then uses the middle of the last 5", () => {
    expect(learnedDuration([run("a", 80, 1)], "dog")).toBeNull();
    expect(learnedDuration([run("a", 80, 1), run("b", 70, 2)], "dog")).toEqual({ minutes: 75, samples: 2 });
    const many = [run("a", 80, 1), run("b", 70, 2), run("c", 90, 3), run("d", 85, 4), run("e", 60, 5), run("f", 10, 6)];
    expect(learnedDuration(many, "dog")).toEqual({ minutes: 80, samples: 5 }); // the 6th (oldest) is dropped
  });

  it("ignores a forgotten Done and other jobs", () => {
    const jobs = [run("a", 80, 1), run("b", 70, 2), run("c", 60 * 20, 3), { ...run("d", 30, 1), template_key: "dishes" }];
    expect(learnedDuration(jobs, "dog")).toEqual({ minutes: 75, samples: 2 });
  });
});

describe("waiting jobs", () => {
  it("count days with nobody on it, and go on the agenda at 3", () => {
    const old = job({ id: "old", created_at: hrs(-24 * 3.5) });
    const fresh = job({ id: "fresh", created_at: hrs(-24) });
    const taken = job({ id: "taken", created_at: hrs(-24 * 5) });
    const ps = [part({ job_id: "taken", member_id: "g", effort_pct: 100 })];
    expect(waitingDays(old, ps, NOW)).toBe(3);
    expect(waitingDays(taken, ps, NOW)).toBe(0);
    expect(forAgenda([old, fresh, taken], ps, 3, NOW).map((j) => j.id)).toEqual(["old"]);
  });
});
