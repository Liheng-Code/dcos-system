// doc 22 P2.2 (Wave 1 gate): the browser-side Planning services a release depends on. They are thin wrappers over
// RPCs and tables, so these tests pin down what they send and how they read rows back: baseline-service,
// schedule-service, the planning-queries helpers the Sheet uses, the quality-gate setting and the actual-date rule
// the calculation applies (the database fills the same dates on write: supabase/tests/planning).
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { kind: "rpc" | "from"; name: string; args?: unknown; ops: [string, unknown[]][] };
const calls: Call[] = [];
let next: { data: unknown; error: { message: string; code?: string } | null } = { data: null, error: null };

function chain(call: Call) {
  const self: Record<string, unknown> = {};
  for (const op of ["select", "eq", "neq", "in", "order", "limit", "range", "update", "insert", "upsert", "delete", "or", "not", "gte"]) {
    self[op] = (...a: unknown[]) => { call.ops.push([op, a]); return self; };
  }
  self.maybeSingle = () => Promise.resolve(next);
  self.single = () => Promise.resolve(next);
  self.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(next).then(res, rej);
  return self;
}
const fake = {
  rpc: (name: string, args: unknown) => { calls.push({ kind: "rpc", name, args, ops: [] }); return Promise.resolve(next); },
  from: (name: string) => { const c: Call = { kind: "from", name, ops: [] }; calls.push(c); return chain(c); },
};
vi.mock("@/lib/supabase/client", () => ({ createClient: () => fake }));

const baseline = await import("../baseline-service");
const schedule = await import("../schedule-service");
const queries = await import("../planning-queries");
const qaqc = await import("../schedule-qaqc-service");
const { toEngineTasks } = await import("../calendar-change");
const { DEFAULT_CALENDAR } = await import("../work-calendar");

beforeEach(() => { calls.length = 0; next = { data: null, error: null }; });

describe("baseline-service", () => {
  it("submits a baseline with null task ids when none are picked, and the 'current' type by default", async () => {
    await baseline.setBaseline("p1", 2, [], { name: "Rev 2", reason: "re-sequenced" });
    expect(calls[0]).toMatchObject({
      kind: "rpc", name: "set_baseline",
      args: { p_project_id: "p1", p_number: 2, p_task_ids: null, p_name: "Rev 2", p_type: "current", p_reason: "re-sequenced" },
    });
    await baseline.setBaseline("p1", 1, ["t1"], { type: "contract" });
    expect(calls[1].args).toMatchObject({ p_task_ids: ["t1"], p_type: "contract", p_name: null, p_reason: null });
  });

  it("approves, rejects, activates and clears through their RPCs", async () => {
    await baseline.approveBaseline("b1");
    await baseline.rejectBaseline("b2", "not ready");
    await baseline.activateBaseline("p1", 1);
    await baseline.clearBaseline("p1", 2, null);
    expect(calls.map((c) => [c.name, c.args])).toEqual([
      ["approve_baseline", { p_baseline_id: "b1", p_comment: null }],
      ["reject_baseline", { p_baseline_id: "b2", p_comment: "not ready" }],
      ["activate_baseline", { p_project_id: "p1", p_number: 1 }],
      ["clear_baseline", { p_project_id: "p1", p_number: 2, p_task_ids: null }],
    ]);
  });

  it("surfaces the database's refusal as the error message", async () => {
    next = { data: null, error: { message: "The person who set this baseline cannot approve it" } };
    await expect(baseline.approveBaseline("b1", "own")).rejects.toThrow("cannot approve it");
  });

  it("reads baselines with their task count, and safe defaults for older rows", async () => {
    next = {
      data: [
        { id: "b0", baseline_number: 0, baseline_name: "Baseline", baseline_date: "2026-10-01", is_active: true, set_by: null,
          snapshot_data: { tasks: [{}, {}, {}] }, baseline_type: null, reason: null, locked: null, client_accepted: null,
          client_accepted_at: null, status: null, decided_by: null, decided_at: null, decision_comment: null },
        { id: "b1", baseline_number: 1, baseline_name: "Rev 1", baseline_date: "2026-11-01", is_active: false, set_by: "u",
          snapshot_data: null, baseline_type: "revised", reason: "EOT", locked: true, client_accepted: false,
          client_accepted_at: null, status: "pending", decided_by: null, decided_at: null, decision_comment: null },
      ],
      error: null,
    };
    const rows = await baseline.listBaselines("p1");
    expect(calls[0].ops).toContainEqual(["eq", ["project_id", "p1"]]);
    expect(rows[0]).toMatchObject({ task_count: 3, baseline_type: "current", status: "approved", locked: false, client_accepted: false });
    expect(rows[1]).toMatchObject({ task_count: 0, baseline_type: "revised", status: "pending", locked: true });
  });

  it("reads a baseline's task snapshot, empty when the slot is unused", async () => {
    next = { data: { snapshot_data: { tasks: [{ id: "t1", start_date: "2026-11-02", end_date: "2026-11-06", budget_cost: 10 }] } }, error: null };
    expect(await baseline.getBaselineSnapshot("p1", 1)).toHaveLength(1);
    next = { data: null, error: null };
    expect(await baseline.getBaselineSnapshot("p1", 9)).toEqual([]);
  });
});

describe("schedule-service", () => {
  it("sets the whole-project baseline in slot 0", async () => {
    await schedule.setProjectBaseline("p1");
    expect(calls[0]).toMatchObject({ name: "set_baseline", args: { p_project_id: "p1", p_number: 0, p_task_ids: null } });
  });

  it("returns empty lists when the RPCs return nothing, and the look-ahead window in weeks", async () => {
    expect(await schedule.getScheduleVariance("p1")).toEqual([]);
    expect(await schedule.getCriticalPathTasks("p1")).toEqual([]);
    expect(await schedule.getLookaheadTasks("p1")).toEqual([]);
    expect(calls[2].args).toEqual({ p_project_id: "p1", p_weeks: 4 });
    await schedule.getLookaheadTasks("p1", 6);
    expect(calls[3].args).toEqual({ p_project_id: "p1", p_weeks: 6 });
  });

  it("rethrows a database error", async () => {
    next = { data: null, error: { message: "permission denied" } };
    await expect(schedule.getScurveSeries("p1")).rejects.toMatchObject({ message: "permission denied" });
  });
});

describe("planning-queries used by the Sheet", () => {
  it("writes recalculated dates in one RPC per batch and checks WBS deletes", async () => {
    await queries.applyScheduleDates({ p_project_id: "p1", p_rows: [{ id: "t1", start_date: "2026-11-02", end_date: "2026-11-06" }] });
    await queries.checkWbsNodeDelete("n1");
    expect(calls.map((c) => [c.name, c.args])).toEqual([
      ["apply_schedule_dates", { p_project_id: "p1", p_rows: [{ id: "t1", start_date: "2026-11-02", end_date: "2026-11-06" }] }],
      ["wbs_node_delete_check", { p_node_id: "n1" }],
    ]);
  });

  it("deletes a WBS node returning its id (empty when RLS refused)", async () => {
    await queries.deleteWbsNodeByIdReturning("n1");
    expect(calls[0]).toMatchObject({ kind: "from", name: "wbs_nodes" });
    expect(calls[0].ops.map((o) => o[0])).toEqual(["delete", "eq", "select"]);
  });
});

describe("schedule quality gate setting", () => {
  it("is 'warn' unless a project sets 'block'", async () => {
    next = { data: null, error: null };
    expect(await qaqc.getQaqcGate("p1")).toBe("warn");
    next = { data: { qaqc_gate: "block" }, error: null };
    expect(await qaqc.getQaqcGate("p1")).toBe("block");
  });
});

describe("actual dates from progress (calculation input)", () => {
  const base = {
    id: "t", task_code: "T", task_name: "T", wbs_node_id: null, start_date: "2026-11-02", end_date: "2026-11-06", duration_days: 5,
    duration_unit: "wd", is_milestone: false, manually_scheduled: false, constraint_type: null, constraint_date: null,
    dependency_task_ids: null, dependency_types: null, dependency_lag_days: null, calendar_id: null,
    actual_start_date: null, actual_finish_date: null, progress: 0,
  };
  it("progress means started as planned; 100% means finished as planned; recorded actuals win", () => {
    const [none, started, done, recorded] = toEngineTasks([
      base, { ...base, progress: 40 }, { ...base, progress: 100 }, { ...base, progress: 40, actual_start_date: "2026-11-03" },
    ], DEFAULT_CALENDAR, new Map());
    expect([none.actualStart, none.actualFinish]).toEqual([null, null]);
    expect([started.actualStart, started.actualFinish, started.percentComplete]).toEqual(["2026-11-02", null, 40]);
    expect([done.actualStart, done.actualFinish]).toEqual(["2026-11-02", "2026-11-06"]);
    expect(recorded.actualStart).toBe("2026-11-03");
  });
});
