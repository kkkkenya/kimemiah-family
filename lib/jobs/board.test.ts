import { describe, expect, it } from "vitest";
import { findDuplicate, weekAhead } from "./board";
import type { Job, Participant } from "./logic";

const job = (id: string, o: Partial<Job>): Job => ({ id, title: id, duration_min: 30, people_needed: 1, ...o }) as Job;

describe("duplicates", () => {
  const jobs = [job("a", { title: "Wash dishes and pots", template_key: "dishes" }), job("b", { title: "Sweep the drive", done_at: "2026-10-23T10:00:00Z" })];
  it("finds the same usual job or the same words, open only", () => {
    expect(findDuplicate({ title: "Anything", template_key: "dishes" }, jobs)?.id).toBe("a");
    expect(findDuplicate({ title: "wash dishes & pots!" }, jobs)?.id).toBe("a");
    expect(findDuplicate({ title: "Sweep the drive" }, jobs)).toBeUndefined();
    expect(findDuplicate({ title: "Mop the floors" }, jobs)).toBeUndefined();
  });
});

describe("week ahead", () => {
  it("puts each job on its Nairobi day, overdue and undated ones today, with people and hours", () => {
    const jobs = [
      job("late", { due_at: "2026-10-22T18:00:00Z" }),
      job("nodate", {}),
      job("sat", { due_at: "2026-10-24T20:30:00Z", duration_min: 60, people_needed: 2 }), // 23:30 Sat Nairobi
      job("far", { due_at: "2026-11-20T10:00:00Z" }),
      job("done", { due_at: "2026-10-25T10:00:00Z", done_at: "2026-10-24T09:00:00Z" }),
    ];
    const parts = [{ id: "p", job_id: "sat", member_id: "greg", effort_pct: 50 } as Participant];
    const w = weekAhead(jobs, parts, "2026-10-24");
    expect(w).toHaveLength(7);
    expect(w[0].day).toBe("2026-10-24");
    expect(w[0].jobs.map((x) => x.job.id).sort()).toEqual(["late", "nodate", "sat"]);
    expect(w[0].jobs.find((x) => x.job.id === "sat")!.people).toEqual(["greg"]);
    expect(w[0].minutes).toBe(30 + 30 + 120);
    expect(w.flatMap((d) => d.jobs.map((x) => x.job.id))).not.toContain("far");
  });
});
