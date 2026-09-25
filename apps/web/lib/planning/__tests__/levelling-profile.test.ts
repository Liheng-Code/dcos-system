import { describe, expect, it } from "vitest";
import { levelResources, type LevelTask } from "../resource-levelling";
import { buildLevellingProfile } from "../levelling-profile";
import { DEFAULT_CALENDAR } from "../work-calendar";

const cal = DEFAULT_CALENDAR; // Mon–Fri

function lev(id: string, overrides: Partial<LevelTask> & { resource?: string | null; resourceUnits?: number } = {}): LevelTask {
  const { resource, resourceUnits, resources, ...rest } = overrides;
  const demands =
    resources ?? (resource === null ? [] : [{ resourceId: resource ?? "Crew A", units: resourceUnits ?? 1 }]);
  return {
    id,
    task_code: id,
    task_name: id,
    durationWd: 3,
    totalFloatWd: 5,
    freeFloatWd: 5,
    earliestStart: "2026-01-05",
    latestFinish: "2026-01-16",
    resources: demands,
    priority: 1,
    ...rest,
  };
}

const peakOf = (peaks: { resourceId: string; before: number; after: number }[], resourceId: string) =>
  peaks.find((p) => p.resourceId === resourceId) ?? { resourceId, before: 0, after: 0 };

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
    expect(peak("before")).toBe(peakOf(result.peaks, "Crew A").before);
    expect(peak("after")).toBe(peakOf(result.peaks, "Crew A").after);
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
    expect(peakOf(result.peaks, "Crew A").before).toBe(1.5);
    expect(peakOf(result.peaks, "Crew A").after).toBeLessThanOrEqual(1);
    expect(result.assignments.length).toBeGreaterThan(0);
  });

  it("a task holding two resources at once contributes to the combined curve twice, once per resource", () => {
    const t1 = lev("T1", { resources: [{ resourceId: "Crew A", units: 1 }, { resourceId: "Crane 1", units: 1 }] });
    const p = buildLevellingProfile([t1], cal, { "Crew A": 1, "Crane 1": 1 }, levelResources([t1], cal, { "Crew A": 1, "Crane 1": 1 }));
    // One task, two resources, three working days each -> the combined "total" curve counts 2 units/day.
    expect(Math.max(...p.daily.map((d) => d.before))).toBe(2);
    expect(p.capacity).toBe(2); // 1 (Crew A) + 1 (Crane 1)
  });
});
