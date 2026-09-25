import { describe, expect, it } from "vitest";
import { levelResources, type LevelTask } from "../resource-levelling";
import { DEFAULT_CALENDAR } from "../work-calendar";

const cal = DEFAULT_CALENDAR; // Mon–Fri

function lev(id: string, overrides: Partial<LevelTask> & { resource?: string | null; resourceUnits?: number } = {}): LevelTask {
  // `resource`/`resourceUnits` (singular, pre-multi-resource shape) is accepted here purely as test-file
  // shorthand and translated to the real `resources[]` array — keeps every existing single-resource case
  // below readable without a `resources: [{ resourceId: ..., units: 1 }]` literal on every line.
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

describe("levelResources — two tasks sharing the same crew", () => {
  it("pushes the lower-priority task to the day after the higher-priority one finishes", () => {
    const t1 = lev("T1", { priority: 1 });
    const t2 = lev("T2", { priority: 2 });

    const result = levelResources([t1, t2], cal);

    expect(result.ok).toBe(true);
    expect(result.overAllocationResolved).toBe(true);
    // T1 keeps its start; T2 slides to right after T1 (3wd duration ends Wed Jan 7).
    expect(result.starts.get("T1")).toBe("2026-01-05");
    expect(result.starts.get("T2")).toBe("2026-01-08");
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0]).toMatchObject({ taskId: "T2", shiftedWd: 3 });
  });

  it("reports peak demand before/after, per resource", () => {
    const result = levelResources([lev("T1"), lev("T2", { priority: 2 })], cal);
    expect(peakOf(result.peaks, "Crew A")).toMatchObject({ before: 2, after: 1 });
  });
});

describe("levelResources — floats exhausted", () => {
  it("reports a residual conflict instead of overrunning the float", () => {
    const t1 = lev("T1", { priority: 1, totalFloatWd: 0, latestFinish: "2026-01-07" });
    const t2 = lev("T2", { priority: 2, totalFloatWd: 0, latestFinish: "2026-01-07" });

    const result = levelResources([t1, t2], cal);

    expect(result.ok).toBe(true);
    expect(result.overAllocationResolved).toBe(false);
    expect(result.residual.length).toBeGreaterThan(0);
    // No mover: both are at zero float, so neither shifted.
    expect(result.assignments).toHaveLength(0);
    expect(result.starts.get("T1")).toBe("2026-01-05");
    expect(result.starts.get("T2")).toBe("2026-01-05");
  });

  it("still moves a task when only one side has float", () => {
    const t1 = lev("T1", { priority: 1, totalFloatWd: 0, latestFinish: "2026-01-07" });
    const t2 = lev("T2", { priority: 2, totalFloatWd: 10, latestFinish: "2026-01-20" });

    const result = levelResources([t1, t2], cal);

    expect(result.ok).toBe(true);
    expect(result.overAllocationResolved).toBe(true);
    expect(result.starts.get("T2")).toBe("2026-01-08");
  });
});

describe("levelResources — resources with different capacities", () => {
  it("honours a capacity of 2 for a crew", () => {
    const t1 = lev("T1", { resource: "Crew B" });
    const t2 = lev("T2", { resource: "Crew B" });
    const t3 = lev("T3", { resource: "Crew B", priority: 3 });

    const result = levelResources([t1, t2, t3], cal, { "Crew B": 2 });

    expect(result.overAllocationResolved).toBe(true);
    // Two can run Jan 5–7; the third (lowest priority) slides to Jan 8.
    expect(result.starts.get("T1")).toBe("2026-01-05");
    expect(result.starts.get("T2")).toBe("2026-01-05");
    expect(result.starts.get("T3")).toBe("2026-01-08");
    expect(peakOf(result.peaks, "Crew B")).toMatchObject({ before: 3, after: 2 });
  });

  it("ignores tasks without any resource demand", () => {
    const a = lev("A", { resource: null });
    const b = lev("B", { resource: null, priority: 2 });
    const result = levelResources([a, b], cal);
    expect(result.ok).toBe(true);
    expect(result.assignments).toHaveLength(0);
    expect(result.starts.get("A")).toBe("2026-01-05");
    expect(result.starts.get("B")).toBe("2026-01-05");
  });
});

describe("levelResources — headcount-scale units (a task needs many units of a big trade)", () => {
  // Regression: two overlapping tasks needing 6 workers each of a 10-worker trade are only
  // 2 tasks (2 <= 10), but 12 workers > 10. A task-count shortcut used to hide this conflict.
  it("levels when summed units exceed capacity even though the task count does not", () => {
    const t1 = lev("T1", { resourceUnits: 6, priority: 1 });
    const t2 = lev("T2", { resourceUnits: 6, priority: 2 });

    const result = levelResources([t1, t2], cal, { "Crew A": 10 });

    expect(peakOf(result.peaks, "Crew A")).toMatchObject({ before: 12, after: 6 });
    expect(result.overAllocationResolved).toBe(true);
    expect(result.starts.get("T1")).toBe("2026-01-05");
    expect(result.starts.get("T2")).toBe("2026-01-08");
  });

  it("leaves a trade alone when the summed units fit", () => {
    const result = levelResources(
      [lev("T1", { resourceUnits: 4 }), lev("T2", { resourceUnits: 6, priority: 2 })],
      cal,
      { "Crew A": 10 },
    );
    expect(result.assignments).toHaveLength(0);
    expect(result.overAllocationResolved).toBe(true);
  });
});

describe("levelResources — multi-resource (a task demanding more than one resource at once)", () => {
  it("moves a task against BOTH its crew and its equipment together, since they're the same task's dates", () => {
    // T1 and T2 both need "Crew A" (cap 1) AND "Crane 1" (cap 1) — a single-resource pass would only
    // catch one of the two conflicts; this must resolve both by moving the same task the same way.
    const t1 = lev("T1", { priority: 1, resources: [{ resourceId: "Crew A", units: 1 }, { resourceId: "Crane 1", units: 1 }] });
    const t2 = lev("T2", { priority: 2, resources: [{ resourceId: "Crew A", units: 1 }, { resourceId: "Crane 1", units: 1 }] });

    const result = levelResources([t1, t2], cal, { "Crew A": 1, "Crane 1": 1 });

    expect(result.overAllocationResolved).toBe(true);
    expect(result.starts.get("T1")).toBe("2026-01-05");
    expect(result.starts.get("T2")).toBe("2026-01-08");
    // Moving T2 once resolves BOTH resources' conflicts in a single shift, not two separate moves.
    expect(result.assignments).toHaveLength(1);
    expect(peakOf(result.peaks, "Crew A")).toMatchObject({ before: 2, after: 1 });
    expect(peakOf(result.peaks, "Crane 1")).toMatchObject({ before: 2, after: 1 });
  });

  it("a task can be the mover for one resource but a bystander for another it doesn't share", () => {
    // T1 + T2 both want the crane (cap 1); T3 alone wants a labour crew that's never over capacity.
    const t1 = lev("T1", { priority: 1, resources: [{ resourceId: "Crane 1", units: 1 }] });
    const t2 = lev("T2", { priority: 2, resources: [{ resourceId: "Crane 1", units: 1 }] });
    const t3 = lev("T3", { priority: 1, resources: [{ resourceId: "Crew A", units: 1 }] });

    const result = levelResources([t1, t2, t3], cal, { "Crane 1": 1, "Crew A": 5 });

    expect(result.starts.get("T2")).toBe("2026-01-08"); // moved for the crane conflict
    expect(result.starts.get("T3")).toBe("2026-01-05"); // never touched — its own resource was never over capacity
  });

  it("a task with an empty resources array never competes for anything", () => {
    const t1 = lev("T1", { resources: [] });
    const result = levelResources([t1], cal, {});
    expect(result.assignments).toHaveLength(0);
    expect(result.peaks).toEqual([]);
  });
});
