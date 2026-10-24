import { describe, expect, it } from "vitest";
import { planHouseAlerts } from "./house";

const people = [
  { id: "greg", name: "Greg" },
  { id: "vinnie", name: "Vinnie" },
  { id: "wanini", name: "Wanini", presence: "away_errands" },
  { id: "peter", name: "Peter", is_remote: true },
];
const noon = Date.parse("2026-10-24T09:00:00Z");
const jobs = [
  { id: "dishes", title: "Wash dishes and pots" },
  { id: "sweep", title: "Sweep the driveway" },
  { id: "old", title: "Old", done_at: "2026-10-23T10:00:00Z" },
];

describe("house alerts", () => {
  it("asks the person a swap is for, saying what's offered back", () => {
    const a = planHouseAlerts([{ id: "s1", job_id: "dishes", to_member: "vinnie", offer_job_id: "sweep", status: "open", actor_id: "greg" }], [], jobs, [], people, noon);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ key: "swap:s1", to: ["vinnie"], title: 'Greg asks: can you take "Wash dishes and pots"?' });
    expect(a[0].body).toContain('"Sweep the driveway"');
  });

  it("skips swaps that are settled or whose job is done", () => {
    expect(planHouseAlerts([{ id: "s", job_id: "dishes", to_member: "vinnie", status: "accepted" }], [], jobs, [], people, noon)).toEqual([]);
    expect(planHouseAlerts([{ id: "s", job_id: "old", to_member: "vinnie", status: "open" }], [], jobs, [], people, noon)).toEqual([]);
  });

  it("tells the others at home that someone just got to the shop", () => {
    const trip = { id: "t1", shop_id: "naivas", member_id: "greg", started_at: "2026-10-24T08:55:00Z" };
    const a = planHouseAlerts([], [trip], jobs, [{ id: "naivas", name: "Naivas" }], people, noon);
    expect(a[0]).toMatchObject({ key: "trip:t1", to: ["vinnie"], title: "Greg is at Naivas", url: "/shop" });
    // A trip started over 15 minutes ago, or finished, says nothing.
    expect(planHouseAlerts([], [{ ...trip, started_at: "2026-10-24T08:30:00Z" }], jobs, [], people, noon)).toEqual([]);
    expect(planHouseAlerts([], [{ ...trip, finished_at: "2026-10-24T08:58:00Z" }], jobs, [], people, noon)).toEqual([]);
  });

  it("keeps quiet hours", () => {
    expect(planHouseAlerts([{ id: "s", job_id: "dishes", to_member: "vinnie", status: "open" }], [], jobs, [], people, Date.parse("2026-10-24T19:00:00Z"))).toEqual([]);
  });
});
