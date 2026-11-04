import { describe, expect, it } from "vitest";
import {
  divisionText, GAP_FILTER, mergeUnits, parseConsumption, rateText, resourceColumnLabel, usageBlockers, WORK_ITEM_GAPS, workItemGaps, workItemLabel,
} from "../boq-item-rules";

describe("boq item rules", () => {
  it("prefers the name over the description", () => {
    expect(workItemLabel({ name: "Terrazzo Flooring", description: "Durable..." })).toBe("Terrazzo Flooring");
    expect(workItemLabel({ name: " ", description: "Durable" })).toBe("Durable");
    expect(workItemLabel({ name: null, description: null })).toBe("");
  });

  it("merges units case-insensitively and keeps the current one", () => {
    expect(mergeUnits(["m2", "M2", "no", " kg ", null], "bag")).toEqual(["bag", "kg", "m2", "no"]);
    expect(mergeUnits([], "m")).toEqual(["m"]);
  });

  it("labels resource columns", () => {
    expect(resourceColumnLabel({ kind: "M", name: "Tiles Mason", unit: "hrs" })).toBe("M Tiles Mason (hr/unit)");
    expect(resourceColumnLabel({ kind: "E", name: "Mixer", unit: "day" })).toBe("E Mixer (day/unit)");
  });

  it("lists delete blockers but not activity links", () => {
    expect(usageBlockers({ assemblyItems: 0, tenderBoqItems: 2, tenderAlternates: 0, qsBoqItems: 1, activityLinks: 5 })).toEqual(["2 tender BOQ items", "1 QS BOQ item"]);
    expect(usageBlockers({ assemblyItems: 0, tenderBoqItems: 0, tenderAlternates: 0, qsBoqItems: 0, activityLinks: 3 })).toEqual([]);
  });

  it("parses a consumption cell", () => {
    expect(parseConsumption("0.4")).toBe(0.4);
    expect(parseConsumption(" ")).toBeNull();
    expect(parseConsumption("0")).toBe("invalid");
    expect(parseConsumption("-1")).toBe("invalid");
    expect(parseConsumption("abc")).toBe("invalid");
  });

  it("formats the division", () => {
    expect(divisionText("09", "Finishes")).toBe("Division 09 - Finishes");
    expect(divisionText(null, undefined)).toBe("-");
  });
});

describe("BOQ item gaps", () => {
  it("lists the gaps of an item in display order", () => {
    expect(workItemGaps({ divisionCode: null, rate: null, usedBy: 0, boqUses: 0 })).toEqual(["division", "rate", "activity", "unused"]);
    expect(workItemGaps({ divisionCode: "03", rate: 12.5, usedBy: 2, boqUses: 4 })).toEqual([]);
    expect(workItemGaps({ divisionCode: "03", rate: 0, usedBy: 1, boqUses: 0 })).toEqual(["unused"]);
  });

  it("has a facts-view filter for every gap", () => {
    for (const g of WORK_ITEM_GAPS) expect(GAP_FILTER[g].column).toBeTruthy();
    expect(GAP_FILTER.rate).toEqual({ column: "net_rate", op: "is" });
  });

  it("formats rates", () => {
    expect(rateText(null)).toBe("-");
    expect(rateText(undefined)).toBe("-");
    expect(rateText(1234.5)).toMatch(/1.?234\.50/);
  });
});
