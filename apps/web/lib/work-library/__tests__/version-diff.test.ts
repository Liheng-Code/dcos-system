import { describe, expect, it } from "vitest";
import { diffFields, diffList, isEmptyDiff } from "../version-diff";

describe("version diff", () => {
  it("reports changed fields and ignores numeric formatting", () => {
    expect(diffFields(
      { name: "Wall tiling", default_unit: "m2", min_duration_pct: "50.00", crew_size: 4, trade: null },
      { name: "Wall tiling (wet areas)", default_unit: "m2", min_duration_pct: 50, crew_size: 6, trade: "" },
    )).toEqual([
      { field: "name", label: "Name", from: "Wall tiling", to: "Wall tiling (wet areas)" },
      { field: "crew_size", label: "Crew size", from: "4", to: "6" },
    ]);
  });

  it("splits a child list into added, removed and changed", () => {
    type L = { code: string; days: number };
    const d = diffList<L>(
      [{ code: "B", days: 1 }, { code: "A", days: 2 }],
      [{ code: "A", days: 3 }, { code: "C", days: 1 }],
      (x) => x.code, (x) => x.code, (x) => `${x.days} d`,
    );
    expect(d.added.map((x) => x.label)).toEqual(["C"]);
    expect(d.removed.map((x) => x.label)).toEqual(["B"]);
    expect(d.changed).toEqual([{ key: "A", label: "A", detail: "2 d → 3 d" }]);
    expect(isEmptyDiff(diffList<L>([{ code: "A", days: 1 }], [{ code: "A", days: 1 }], (x) => x.code, (x) => x.code))).toBe(true);
  });
});
