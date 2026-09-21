import { describe, expect, it } from "vitest";
import { levelResources, type LevelTask } from "../resource-levelling";
import { buildLevellingProfile } from "../levelling-profile";
import { DEFAULT_CALENDAR } from "../work-calendar";

const cal = DEFAULT_CALENDAR; // Mon–Fri

function lev(id: string, overrides: Partial<LevelTask>): LevelTask {
  return {
    id,
    task_code: id,
    task_name: id,
    durationWd: 3,
    totalFloatWd: 5,
    freeFloatWd: 5,
    earliestStart: "2026-01-05",
    latestFinish: "2026-01-16",
    resource: "Crew A",
    resourceUnits: 1,
    priority: 1,
    ...overrides,
  };
}

describe("buildLevellingProfile", () => {
  it("shows the overlap before levelling and the flattened curve after", () => {
    const tasks = [lev("T1", { priority: 1 }), lev("T2", { priority: 2 })];
    const capacities = { "Crew A": 1 };
    const result = levelResources(tasks, cal, capacities);

    const p = buildLevellingProfile(tasks, cal, capacities, result);

    const peak = (k: "before" | "after") => Math.max(...p.daily.map((d) => d[k]));
    expect(peak("before")).toBe(2);
    expect(peak("after")).toBe(1);
    // Same peaks the engine reports — the chart and the engine cannot disagree.
    expect(peak("before")).toBe(result.peakBefore);
    expect(peak("after")).toBe(result.peakAfter);
    expect(p.capacity).toBe(1);
    // Three shared days over capacity before, none after.
    expect(p.overDaysBefore).toBe(3);
    expect(p.overDaysAfter).toBe(0);
  });

  it("sums capacity across every levelled resource and ignores unresourced tasks", () => {
    const tasks = [lev("T1", { resource: "A" }), lev("T2", { resource: "B" }), lev("T3", { resource: null })];
    const capacities = { A: 2, B: 3 };
    const p = buildLevellingProfile(tasks, cal, capacities, levelResources(tasks, cal, capacities));
    expect(p.capacity).toBe(5);
    expect(p.overDaysBefore).toBe(0);
  });

  it("handles fractional units — 3 tasks at 0.5 on a 1-unit crew is over capacity", () => {
    // Regression: percent inputs (50/100) used to slip past the engine's task-count shortcut.
    const tasks = ["T1", "T2", "T3"].map((id, i) => lev(id, { resourceUnits: 0.5, priority: i + 1 }));
    const capacities = { "Crew A": 1 };
    const result = levelResources(tasks, cal, capacities);
    expect(result.peakBefore).toBe(1.5);
    expect(result.peakAfter).toBeLessThanOrEqual(1);
    expect(result.assignments.length).toBeGreaterThan(0);
  });
});
