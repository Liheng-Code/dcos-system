import { describe, expect, it } from "vitest";
import { cleanFilter } from "../saved-views-service";

describe("cleanFilter (shared saved views)", () => {
  it("keeps well-formed fields", () => {
    expect(cleanFilter({ text: "slab", statuses: ["in_progress"], criticalOnly: true, from: "2026-11-01", discipline: "STR" }))
      .toEqual({ text: "slab", statuses: ["in_progress"], incompleteOnly: undefined, criticalOnly: true, discipline: "STR", owner: null, from: "2026-11-01", to: null });
  });

  it("drops malformed values instead of breaking the Gantt", () => {
    const f = cleanFilter({ text: 42, statuses: ["ok", 7], criticalOnly: "yes", from: "next week", owner: {} });
    expect(f.text).toBeUndefined();
    expect(f.statuses).toEqual(["ok"]);
    expect(f.criticalOnly).toBeUndefined();
    expect(f.from).toBeNull();
    expect(f.owner).toBeNull();
    expect(cleanFilter(null)).toEqual(cleanFilter({}));
  });
});
