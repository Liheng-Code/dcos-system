import { describe, expect, it } from "vitest";
import { defaultReadinessSource, filterSortBlocking, fixKind, reasonCounts } from "../readiness-view";
import type { BlockingLine } from "../readiness";

const line = (itemCode: string, amount: number, reasons: BlockingLine["reasons"]): BlockingLine => ({ lineId: itemCode, itemCode, description: itemCode, amount, reasons, primary: reasons[0] });
const lines = [line("1.2", 100, ["not_linked"]), line("1.10", 500, ["no_labour", "location_unmapped"]), line("1.1", 300, ["not_linked", "no_labour"])];

describe("readiness view helpers", () => {
  it("picks the default source from the project status", () => {
    expect(defaultReadinessSource("draft")).toBe("tender");
    expect(defaultReadinessSource(undefined)).toBe("tender");
    expect(defaultReadinessSource("active")).toBe("contract");
  });

  it("routes each reason to its fix", () => {
    expect(fixKind("not_mapped")).toBe("mapping");
    expect(fixKind("not_linked")).toBe("boq_item");
    expect(fixKind("labour_placeholder")).toBe("boq_item");
    expect(fixKind("location_ignored")).toBe("location");
  });

  it("filters by any reason and sorts", () => {
    expect(filterSortBlocking(lines, "no_labour", "amount_desc").map((l) => l.itemCode)).toEqual(["1.10", "1.1"]);
    expect(filterSortBlocking(lines, "all", "amount_asc").map((l) => l.itemCode)).toEqual(["1.2", "1.1", "1.10"]);
    expect(filterSortBlocking(lines, "all", "code").map((l) => l.itemCode)).toEqual(["1.1", "1.2", "1.10"]);
  });

  it("counts reasons", () => {
    const c = reasonCounts(lines);
    expect(c.not_linked).toBe(2);
    expect(c.no_labour).toBe(2);
    expect(c.not_mapped).toBe(0);
  });
});
