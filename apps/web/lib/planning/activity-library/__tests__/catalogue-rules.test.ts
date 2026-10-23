import { describe, expect, it } from "vitest";
import { canArchive, dedupeLast, pickLatestPerCode, safeTerm } from "../catalogue-rules";
import { isPercentHeader, parseActivityImport, percentCellValue } from "../activity-database-import";

describe("canArchive", () => {
  it("allows draft, active and superseded only (matches trg_plan_act_master_guard)", () => {
    expect(["draft", "active", "superseded"].every(canArchive)).toBe(true);
    expect(["under_review", "approved", "archived"].some(canArchive)).toBe(false);
  });
});

describe("safeTerm", () => {
  it("strips filter-breaking characters and double quotes", () => {
    expect(safeTerm('a,b(c)"d"*e')).toBe("a b c d e");
  });
  it("escapes LIKE wildcards", () => {
    expect(safeTerm("50%_x")).toBe("50\\%\\_x");
  });
  it("collapses whitespace", () => {
    expect(safeTerm("  wall   block ")).toBe("wall block");
  });
});

describe("pickLatestPerCode", () => {
  it("keeps the highest version per code and preserves order", () => {
    const rows = [
      { id: "a1", code: "A", version: 1 },
      { id: "b1", code: "B", version: 1 },
      { id: "a2", code: "A", version: 2 },
    ];
    expect(pickLatestPerCode(rows).map((r) => r.id)).toEqual(["b1", "a2"]);
  });
});

describe("dedupeLast", () => {
  it("keeps the last duplicate and reports the earlier ones", () => {
    const r = dedupeLast([{ k: "x", v: 1 }, { k: "y", v: 2 }, { k: "x", v: 3 }], (o) => o.k);
    expect(r.rows).toEqual([{ k: "y", v: 2 }, { k: "x", v: 3 }]);
    expect(r.duplicates).toEqual([{ k: "x", v: 1 }]);
  });
});

describe("percent cells", () => {
  it("scales percent-formatted cells (50% is stored as 0.5)", () => {
    expect(percentCellValue(0.5, "0%")).toBe(50);
    expect(percentCellValue(0.125, "0.0%")).toBe(12.5);
    expect(percentCellValue(0.5, "General", "50%")).toBe(50);
  });
  it("leaves unformatted numbers alone", () => {
    expect(percentCellValue(50, "General", "50")).toBe(50);
    expect(percentCellValue(0.5)).toBe(0.5);
  });
  it("recognises percent columns by header", () => {
    expect(["Min %", "Max %", "%", "Share %"].every(isPercentHeader)).toBe(true);
    expect(isPercentHeader("Days/Unit")).toBe(false);
  });
  it("accepts text percentages like '75%'", () => {
    const r = parseActivityImport({ activities: [{ "Division Code": "03", Code: "A", Name: "n", "Min %": "75%", "Max %": 100 }], links: [] });
    expect(r.errors).toEqual([]);
    expect(r.activities[0].minPct).toBe(75);
  });
});

describe("work item codes", () => {
  it("are upper-cased by the parser", () => {
    const r = parseActivityImport({ activities: [], links: [{ "Activity Code": "D03-001", "Work Item Code": "wi-9" }] });
    expect(r.links[0].workItemCode).toBe("WI-9");
  });
});
