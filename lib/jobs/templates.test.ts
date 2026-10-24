import { describe, expect, it } from "vitest";
import { CATEGORIES, PART_NOTES, TEMPLATES, TOOLS_FOR } from "./templates";

describe("job library", () => {
  it("has a big library with one entry per id", () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(70);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });

  it("only uses known kinds, sizes the database accepts, and tools for real jobs", () => {
    const kinds = new Set(CATEGORIES.map((c) => c.id));
    for (const t of TEMPLATES) {
      expect(kinds.has(t.category), t.id).toBe(true);
      expect(t.duration_min).toBeGreaterThanOrEqual(5);
      expect(t.duration_min).toBeLessThanOrEqual(1440);
      expect(t.people_needed).toBeGreaterThanOrEqual(1);
      expect(t.people_needed).toBeLessThanOrEqual(4);
      // Urgent jobs are due within hours.
      if (t.urgent) expect(t.dueInHours).toBeDefined();
    }
    const ids = new Set(TEMPLATES.map((t) => t.id));
    for (const key of Object.keys(TOOLS_FOR)) expect(ids.has(key), key).toBe(true);
    for (const key of Object.keys(PART_NOTES)) expect(kinds.has(key as never), key).toBe(true);
  });

  it("covers every kind of job", () => {
    for (const c of CATEGORIES) expect(TEMPLATES.some((t) => t.category === c.id), c.id).toBe(true);
  });
});
