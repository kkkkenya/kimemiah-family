import { describe, expect, it } from "vitest";
import { actionsOf, NOTICE, typeOf } from "./style";

describe("notification types", () => {
  it("gives each alert its type", () => {
    expect(typeOf({ kind: "urgent" })).toBe("urgent");
    expect(typeOf({ kind: "reminder" })).toBe("due");
    expect(typeOf({ kind: "overdue" })).toBe("due");
    expect(typeOf({ kind: "handover" })).toBe("suggest");
    expect(typeOf({ kind: "covered" })).toBe("team");
    expect(typeOf({ kind: "ease" })).toBe("thanks");
    expect(typeOf({ kind: "funds" })).toBe("money");
    expect(typeOf({ kind: "funds", key: "budget:food:2026-10:80" })).toBe("money");
    expect(typeOf({ kind: "funds", key: "billdue:gas:2026-10-25" })).toBe("bill");
    expect(typeOf({ kind: "funds", key: "review:r1" })).toBe("question");
    expect(typeOf({ kind: "handover", key: "swap:s1" })).toBe("swap");
    expect(typeOf({ kind: "funds", key: "trip:t1" })).toBe("shop");
  });

  it("puts the right buttons on each, opening the place the action happens", () => {
    expect(actionsOf({ kind: "reminder", jobId: "j" })).toEqual([{ action: "done", title: "✓ Done", url: "/jobs?done=j&now=1" }]);
    expect(actionsOf({ kind: "urgent", jobId: "j" })[0].url).toBe("/jobs?join=j");
    expect(actionsOf({ kind: "handover", key: "swap:s9" })[0]).toEqual({ action: "accept", title: "Accept", url: "/jobs?swap=s9&accept=1" });
    expect(actionsOf({ kind: "funds", key: "billdue:gas:x", url: "/money?pay=gas" })[0].url).toBe("/money?pay=gas");
    expect(actionsOf({ kind: "covered", jobId: "j" })).toEqual([]);
  });

  it("only sticks around for what can't wait", () => {
    expect(Object.entries(NOTICE).filter(([, s]) => s.sticky).map(([t]) => t)).toEqual(["urgent", "swap"]);
  });
});
