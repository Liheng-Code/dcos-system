import { describe, expect, it } from "vitest";
import { coverageBand, coveragePct, totalCoverage, type DivisionCoverage } from "../coverage-rules";

const row = (o: Partial<DivisionCoverage>): DivisionCoverage => ({
  division_code: "03", activities: 10, quantity_based: 8, with_norm: 8, needs_package: 10, with_package: 9,
  with_boq: 5, with_method_statement: 0, with_tc: 1, with_shop_drawing: 0, with_material: 0, ...o,
});

describe("coverage rules", () => {
  it("computes a percentage with nothing to cover as null", () => {
    expect(coveragePct(8, 8)).toBe(100);
    expect(coveragePct(1, 3)).toBe(33);
    expect(coveragePct(0, 0)).toBeNull();
  });

  it("bands percentages", () => {
    expect([100, 75, 20, 0, null].map(coverageBand)).toEqual(["full", "good", "low", "none", "na"]);
  });

  it("totals the divisions", () => {
    const t = totalCoverage([row({}), row({ division_code: "09", activities: 5, with_boq: 5 })]);
    expect(t.division_code).toBeNull();
    expect(t.activities).toBe(15);
    expect(t.with_boq).toBe(10);
  });
});
