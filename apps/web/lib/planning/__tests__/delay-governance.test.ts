import { describe, expect, it } from "vitest";
import { captureDelayFloat } from "../delay-governance";
import { DEFAULT_CALENDAR } from "../work-calendar";
import type { DelayTask } from "../delay-analysis";

const cal = DEFAULT_CALENDAR; // Mon–Fri

function task(id: string, overrides: Partial<DelayTask>): DelayTask {
  return {
    id,
    task_code: id,
    task_name: id,
    discipline: null,
    start_date: null,
    end_date: null,
    baseline_start: null,
    baseline_finish: null,
    progress: 0,
    is_milestone: false,
    manually_scheduled: false,
    constraint_type: null,
    constraint_date: null,
    dependency_task_ids: [],
    dependency_types: [],
    dependency_lag_days: [],
    delay_reason: null,
    field_observation_notes: null,
    ...overrides,
  };
}

// Shared chain: A -> B ─┐
//                 A -> C ┴-> M (milestone). C (6wd, Jan 8–15) is the long pole
// in the baseline, so a whole-network slide never spends a task's float.
function network(liveOverrides: Partial<Record<"A" | "B", { start?: string; end: string }>>): DelayTask[] {
  const A = liveOverrides.A ?? { end: "2026-01-07" };
  const B = liveOverrides.B ?? { end: "2026-01-08" };
  return [
    task("A", {
      baseline_start: "2026-01-05",
      baseline_finish: "2026-01-07",
      start_date: "2026-01-05",
      end_date: A.end,
      progress: 1,
    }),
    task("B", {
      baseline_start: "2026-01-08",
      baseline_finish: "2026-01-08",
      start_date: B.start ?? "2026-01-08",
      end_date: B.end,
      dependency_task_ids: ["A"],
      dependency_types: ["fs"],
      dependency_lag_days: [0],
    }),
    task("C", {
      baseline_start: "2026-01-08",
      baseline_finish: "2026-01-15",
      start_date: "2026-01-08",
      end_date: "2026-01-15",
      dependency_task_ids: ["A"],
      dependency_types: ["fs"],
      dependency_lag_days: [0],
    }),
    task("M", {
      baseline_start: "2026-01-16",
      baseline_finish: "2026-01-16",
      start_date: "2026-01-16",
      end_date: "2026-01-16",
      is_milestone: true,
      dependency_task_ids: ["B", "C"],
      dependency_types: ["fs", "fs"],
      dependency_lag_days: [0, 0],
    }),
  ];
}

describe("captureDelayFloat — governance signal routing", () => {
  it("does NOT flag a task that merely slid with the whole network (float preserved)", () => {
    // A's live run is longer (Jan 5→12), so B and C both recompute later. The
    // project slips but B still holds its full 5wd float → not a candidate.
    const capture = captureDelayFloat(
      network({ A: { end: "2026-01-12" } }),
      cal,
      "2026-01-05",
      "2026-01-12",
    );

    expect(capture.ok).toBe(true);
    expect(capture.projectSlipWd).toBeGreaterThan(0);
    const b = capture.byTask.get("B")!;
    expect(b.critical).toBe(false);
    expect(b.becameCritical).toBe(false);
    expect(capture.candidates.find((c) => c.taskId === "B")).toBeUndefined();
  });

  it("flags B as critical + candidate when ITS OWN prolongation burns the float", () => {
    // B runs Jan 8 → Jan 31 (17wd instead of 1). B now drives the milestone,
    // the project slips 15wd, and B's float is consumed → became critical.
    const capture = captureDelayFloat(
      network({ B: { start: "2026-01-13", end: "2026-01-31" } }),
      cal,
      "2026-01-05",
      "2026-01-08",
    );

    expect(capture.ok).toBe(true);
    expect(capture.projectSlipWd).toBeGreaterThan(0);
    const b = capture.byTask.get("B")!;
    expect(b.critical).toBe(true);
    expect(b.becameCritical).toBe(true);
    expect(b.finishSlipWd).toBe(16);
    expect(b.consumedFloatWd).toBeGreaterThan(0);

    const cand = capture.candidates.find((c) => c.taskId === "B");
    expect(cand).toBeDefined();
    expect(cand!.reason).toMatch(/consumed|critical/);
  });

  it("reports a clean, empty candidate list on extreme inputs", () => {
    const capture = captureDelayFloat(
      network({ B: { start: "2026-01-13", end: "2026-01-31" } }),
      cal,
      "2026-01-05",
      "2026-01-08",
      50,
    );
    expect(capture.ok).toBe(true);
    expect(capture.candidates.length).toBeGreaterThan(0); // critical drivers always present
  });
});

describe("captureDelayFloat — extremes", () => {
  it("returns ok:false with a cycle and empty candidates on a cyclic network", () => {
    const tasks: DelayTask[] = [
      task("X", {
        baseline_start: "2026-01-05",
        baseline_finish: "2026-01-07",
        start_date: "2026-01-05",
        end_date: "2026-01-07",
        dependency_task_ids: ["Y"],
        dependency_types: ["fs"],
        dependency_lag_days: [0],
      }),
      task("Y", {
        baseline_start: "2026-01-05",
        baseline_finish: "2026-01-07",
        start_date: "2026-01-05",
        end_date: "2026-01-07",
        dependency_task_ids: ["X"],
        dependency_types: ["fs"],
        dependency_lag_days: [0],
      }),
    ];
    const capture = captureDelayFloat(tasks, cal, "2026-01-05", "2026-01-07");
    expect(capture.ok).toBe(false);
    expect(capture.cycle).toBeDefined();
    expect(capture.candidates).toHaveLength(0);
  });
});