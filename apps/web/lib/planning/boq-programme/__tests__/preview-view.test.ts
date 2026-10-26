import { describe, expect, it } from "vitest";
import {
  cleanResourceName, divisionOfTask, filterTasks, groupPreview, groupWarnings, NO_FILTERS, rowKind, valueMatches,
} from "../preview-view";
import type { PlannedTask, PlanWarning } from "../boq-programme-planner";

const task = (o: Partial<PlannedTask>): PlannedTask => ({
  key: "m|n", masterId: "m", masterCode: "ACT-1", visibleCode: "D09-001", nodeId: "n1", name: "Tiling", unit: "m2", quantity: 10, budget: 100, durationDays: 2,
  basis: "labour", labourHours: 16, crewSize: 4, hoursPerDay: 8, clamped: false, confidence: "high", action: "create", existingTaskId: null, alsoMapped: [],
  unchanged: false, boqLines: [], resourceHours: [], predecessors: [], warnings: [], ...o,
});

describe("preview view helpers", () => {
  it("cleans migrated resource names", () => {
    expect(cleanResourceName("Migrated from company_rate_library_lines, desc='Mason crew'")).toBe("Mason crew");
    expect(cleanResourceName("Migrated flat-rate placeholder for Nails, assorted 2-4\". Category (material) heuristically inferred")).toBe("Nails, assorted 2-4\"");
    expect(cleanResourceName("Tiles Mason")).toBe("Tiles Mason");
    expect(cleanResourceName(null)).toBe("");
    expect(cleanResourceName("x".repeat(80)).length).toBe(60);
  });

  it("maps actions to row kinds", () => {
    expect(rowKind({ action: "create", unchanged: false })).toBe("create");
    expect(rowKind({ action: "update", unchanged: true })).toBe("unchanged");
    expect(rowKind({ action: "update", unchanged: false })).toBe("update");
    expect(rowKind({ action: "skip_locked", unchanged: false })).toBe("skipped");
  });

  it("finds the division from the master, then the visible code", () => {
    expect(divisionOfTask({ masterId: "m", visibleCode: "D04-001" }, new Map([["m", "09"]]))).toBe("09");
    expect(divisionOfTask({ masterId: "m", visibleCode: "D04-001" }, new Map())).toBe("04");
    expect(divisionOfTask({ masterId: "m", visibleCode: null }, new Map())).toBe("");
  });

  it("groups by floor order then division", () => {
    const tasks = [
      task({ key: "a", nodeId: "n2", visibleCode: "D09-002", name: "B" }),
      task({ key: "b", nodeId: "n1", visibleCode: "D09-001", masterId: "m1" }),
      task({ key: "c", nodeId: "n1", visibleCode: "D04-001", masterId: "m2" }),
    ];
    const g = groupPreview(tasks, ["n1", "n2"], new Map([["n1", "Ground"], ["n2", "Level 1"]]), new Map());
    expect(g.map((f) => f.name)).toEqual(["Ground", "Level 1"]);
    expect(g[0].divisions.map((d) => d.code)).toEqual(["04", "09"]);
    expect(g[0].count).toBe(2);
  });

  it("filters", () => {
    const ts = [task({ key: "a" }), task({ key: "b", action: "update", confidence: "low", warnings: ["no_crew"], name: "Paint" })];
    expect(filterTasks(ts, { ...NO_FILTERS, kind: "update" }).map((t) => t.key)).toEqual(["b"]);
    expect(filterTasks(ts, { ...NO_FILTERS, warningsOnly: true }).map((t) => t.key)).toEqual(["b"]);
    expect(filterTasks(ts, { ...NO_FILTERS, confidence: "high" }).map((t) => t.key)).toEqual(["a"]);
    expect(filterTasks(ts, { ...NO_FILTERS, search: "paint" }).map((t) => t.key)).toEqual(["b"]);
  });

  it("groups warnings and checks the value", () => {
    const w: PlanWarning[] = [{ code: "no_crew", message: "" }, { code: "no_labour", message: "" }, { code: "no_crew", message: "" }];
    expect(groupWarnings(w).map((g) => [g.code, g.count])).toEqual([["no_crew", 2], ["no_labour", 1]]);
    expect(valueMatches(100.001, 100)).toBe(true);
    expect(valueMatches(99, 100)).toBe(false);
  });
});
