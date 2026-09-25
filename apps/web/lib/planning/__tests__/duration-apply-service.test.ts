import { describe, expect, it } from "vitest";
import { computeDurationApply, resolveLockedNodeIds, type DurationApplyContext } from "../duration-apply-service";
import { DEFAULT_CALENDAR } from "../work-calendar";

// A Mon-Fri calendar with no exceptions (DEFAULT_CALENDAR), so working days are easy to reason about:
// 2026-10-05 is a Monday.

function task(over: Partial<DurationApplyContext["tasksById"] extends Map<string, infer T> ? T : never>) {
  return {
    id: "t1", wbs_node_id: null, task_code: "T1", task_name: "Task 1",
    start_date: "2026-10-05", end_date: "2026-10-09", is_milestone: false,
    dependency_task_ids: null, dependency_types: null, dependency_lag_days: null,
    constraint_type: null, constraint_date: null, manually_scheduled: false,
    ...over,
  };
}

function ctx(tasks: ReturnType<typeof task>[], work: Record<string, Partial<{ duration_mode: string; duration_wd_current: number | null; duration_wd_derived: number | null; calc_status: string }>>, lockedNodeIds: Set<string> = new Set()): DurationApplyContext {
  return {
    projectId: "p1",
    cal: DEFAULT_CALENDAR,
    dataDate: "2026-10-01",
    tasksById: new Map(tasks.map((t) => [t.id, t])),
    allTasks: tasks,
    lockedNodeIds,
    workByTask: new Map(Object.entries(work).map(([id, w]) => [id, { duration_mode: "fixed_crew", duration_wd_current: 5, duration_wd_derived: 3, calc_status: "ok", ...w }])),
  };
}

describe("resolveLockedNodeIds", () => {
  it("locks a node's descendants transitively", () => {
    const nodes = [
      { id: "root", parent_id: null, is_locked: true },
      { id: "child", parent_id: "root", is_locked: false },
      { id: "grandchild", parent_id: "child", is_locked: false },
      { id: "other", parent_id: null, is_locked: false },
    ];
    const locked = resolveLockedNodeIds(nodes);
    expect(locked).toEqual(new Set(["root", "child", "grandchild"]));
  });

  it("guards against a cycle instead of looping forever", () => {
    const nodes = [{ id: "a", parent_id: "b", is_locked: false }, { id: "b", parent_id: "a", is_locked: false }];
    expect(resolveLockedNodeIds(nodes)).toEqual(new Set());
  });
});

describe("computeDurationApply", () => {
  it("shrinks the finish date to match the derived duration and ripples a dependent successor", () => {
    const t1 = task({ id: "t1", start_date: "2026-10-05", end_date: "2026-10-09" }); // 5 working days
    const t2 = task({
      id: "t2", task_code: "T2", start_date: "2026-10-12", end_date: "2026-10-13",
      dependency_task_ids: ["t1"], dependency_types: ["fs"], dependency_lag_days: [0],
    });
    const context = ctx([t1, t2], { t1: { duration_wd_current: 5, duration_wd_derived: 3 } });
    const r = computeDurationApply(context, "t1");
    expect(r.ok).toBe(true);
    if (!r.ok || r.noChange) throw new Error("expected a change");
    expect(r.target.newEnd).toBe("2026-10-07"); // Mon-Wed = 3 working days
    expect(r.target.oldDurationWd).toBe(5);
    expect(r.target.newDurationWd).toBe(3);
    expect(r.rippled).toHaveLength(1);
    expect(r.rippled[0].id).toBe("t2");
    expect(r.rippled[0].newStart).toBe("2026-10-08"); // next working day after the new finish
  });

  it("reports no change when the derived duration already matches the current one", () => {
    const t1 = task({ start_date: "2026-10-05", end_date: "2026-10-07" }); // 3 working days
    const context = ctx([t1], { t1: { duration_wd_current: 3, duration_wd_derived: 3 } });
    const r = computeDurationApply(context, "t1");
    expect(r.ok).toBe(true);
    expect(r.ok && r.noChange).toBe(true);
  });

  it("refuses a milestone", () => {
    const t1 = task({ is_milestone: true });
    const r = computeDurationApply(ctx([t1], { t1: {} }), "t1");
    expect(r).toEqual({ ok: false, reason: "Milestones have no duration to change." });
  });

  it("refuses a task with a hard schedule constraint", () => {
    const t1 = task({ constraint_type: "must_finish_on", constraint_date: "2026-10-09" });
    const r = computeDurationApply(ctx([t1], { t1: {} }), "t1");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/schedule constraint/);
  });

  it("refuses a task under a locked WBS node", () => {
    const t1 = task({ wbs_node_id: "n1" });
    const r = computeDurationApply(ctx([t1], { t1: {} }, new Set(["n1"])), "t1");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/locked WBS node/);
  });

  it("refuses when the task isn't in fixed-crew mode", () => {
    const t1 = task({});
    const r = computeDurationApply(ctx([t1], { t1: { duration_mode: "manual" } }), "t1");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/Fixed crew/);
  });

  it("refuses when there is no valid crew-derived duration yet", () => {
    const t1 = task({});
    const r1 = computeDurationApply(ctx([t1], { t1: { calc_status: "missing_norm", duration_wd_derived: null } }), "t1");
    expect(r1.ok).toBe(false);
    const r2 = computeDurationApply(ctx([t1], { t1: { duration_wd_derived: null } }), "t1");
    expect(r2.ok).toBe(false);
  });

  it("refuses a task with no work row at all", () => {
    const t1 = task({});
    const r = computeDurationApply(ctx([t1], {}), "t1");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/Fixed crew/);
  });

  it("a successor under a locked WBS node is skipped from the ripple, not written", () => {
    const t1 = task({ id: "t1", start_date: "2026-10-05", end_date: "2026-10-09" });
    const t2 = task({
      id: "t2", wbs_node_id: "locked-node", start_date: "2026-10-12", end_date: "2026-10-13",
      dependency_task_ids: ["t1"], dependency_types: ["fs"], dependency_lag_days: [0],
    });
    const context = ctx([t1, t2], { t1: { duration_wd_current: 5, duration_wd_derived: 3 } }, new Set(["locked-node"]));
    const r = computeDurationApply(context, "t1");
    expect(r.ok).toBe(true);
    if (!r.ok || r.noChange) throw new Error("expected a change");
    expect(r.rippled).toHaveLength(0);
    expect(r.skippedLocked).toHaveLength(1);
    expect(r.skippedLocked[0].id).toBe("t2");
  });

  it("reports a circular dependency instead of throwing", () => {
    const t1 = task({ id: "t1", dependency_task_ids: ["t2"], dependency_types: ["fs"], dependency_lag_days: [0] });
    const t2 = task({ id: "t2", dependency_task_ids: ["t1"], dependency_types: ["fs"], dependency_lag_days: [0] });
    const r = computeDurationApply(ctx([t1, t2], { t1: { duration_wd_current: 5, duration_wd_derived: 3 } }), "t1");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/circular/i);
  });
});
