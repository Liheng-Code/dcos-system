import { describe, expect, it } from "vitest";
import { activationSteps, csiCounts, inCsiSelection, NO_DIVISION_KEY, NO_SECTION } from "../csi-grouping";

const rows = [
  { csi_division_code: "03", csi_section_code: "03 30 00" },
  { csi_division_code: "03", csi_section_code: "03 30 00" },
  { csi_division_code: "03", csi_section_code: null },
  { csi_division_code: "05", csi_section_code: "05 12 00" },
  { csi_division_code: null, csi_section_code: null },
];

describe("csi grouping", () => {
  it("counts per division and section", () => {
    const { byDivision, bySection } = csiCounts(rows);
    expect(byDivision.get("03")).toBe(3);
    expect(byDivision.get(NO_DIVISION_KEY)).toBe(1);
    expect(bySection.get("03|03 30 00")).toBe(2);
    expect(bySection.get(`03|${NO_SECTION}`)).toBe(1);
  });

  it("filters by the selected division or section", () => {
    expect(rows.filter((r) => inCsiSelection(r, { level: "all" }))).toHaveLength(5);
    expect(rows.filter((r) => inCsiSelection(r, { level: "division", code: "03" }))).toHaveLength(3);
    expect(rows.filter((r) => inCsiSelection(r, { level: "section", division: "03", code: NO_SECTION }))).toHaveLength(1);
    expect(rows.filter((r) => inCsiSelection(r, { level: "division", code: NO_DIVISION_KEY }))).toHaveLength(1);
  });

  it("walks a draft to active one step at a time", () => {
    expect(activationSteps("draft")).toEqual(["under_review", "approved", "active"]);
    expect(activationSteps("approved")).toEqual(["active"]);
    expect(activationSteps("active")).toEqual([]);
    expect(activationSteps("superseded")).toEqual([]);
  });
});
