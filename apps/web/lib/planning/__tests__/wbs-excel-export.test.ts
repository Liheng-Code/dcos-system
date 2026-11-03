import { describe, expect, it } from "vitest";
import { predecessorText, wbsWorkbookRows, type ExportNode, type ExportTask } from "../wbs-excel-export";

const node = (id: string, parent: string | null, code: string, sort: number, over: Partial<ExportNode> = {}): ExportNode => ({
  id, parent_id: parent, wbs_code: code, wbs_outline_code: null, wbs_name: `Node ${code}`, node_type: "task_group", sort_order: sort,
  cost_code: null, discipline: null, responsible_id: null, is_locked: false, ...over,
});
const task = (id: string, nodeId: string, over: Partial<ExportTask> = {}): ExportTask => ({
  id, wbs_node_id: nodeId, task_code: id, task_name: `Task ${id}`, wbs_outline_code: null, start_date: "2026-11-02", end_date: "2026-11-06",
  duration_days: 5, duration_unit: "wd", progress: 0, is_milestone: false, constraint_type: null, constraint_date: null,
  baseline_start_date: null, baseline_finish_date: null, actual_start_date: null, actual_finish_date: null,
  dependency_task_ids: [], dependency_types: [], dependency_lag_days: [], owner_name: null, cost_code: null, sort_order: 1, ...over,
});

describe("WBS Excel export (doc 35 I8)", () => {
  it("lists nodes in tree order with roll-ups and the responsible person", () => {
    const nodes = [node("b", null, "02", 2), node("a", null, "01", 1, { responsible_id: "u1" }), node("a1", "a", "01.01", 1)];
    const tasks = [
      task("T1", "a1", { duration_days: 10, progress: 100 }),
      task("T2", "a1", {
        start_date: "2026-11-09", end_date: "2026-11-20", duration_days: 30, progress: 0,
        dependency_task_ids: ["T1"], dependency_types: ["SS"], dependency_lag_days: [2],
      }),
    ];
    const { wbs, activities } = wbsWorkbookRows(nodes, tasks, new Map([["u1", "Dara"]]));
    expect(wbs.slice(1).map((r) => r[0])).toEqual(["01", "01.01", "02"]);
    expect(wbs[1]).toEqual(["01", "Node 01", 1, "task_group", "Dara", null, null, "2026-11-02", "2026-11-20", 2, 25, ""]);
    expect(activities[2][14]).toBe("T1 SS+2");
    expect(activities).toHaveLength(3);
  });

  it("writes negative lags and unknown predecessors", () => {
    const t = task("X", "n", { dependency_task_ids: ["Y", "00000000-zzzz"], dependency_types: ["fs", "FF"], dependency_lag_days: [-1, 0] });
    expect(predecessorText(t, new Map([["Y", "Y1"]]))).toBe("Y1 FS-1, 00000000 FF");
  });
});
