import { describe, expect, it } from "vitest";
import type { TaskFloat } from "@dcos/scheduling-engine";
import { filterOptions, filterTree, groupTree, isFilterActive, GROUP_ROW_PREFIX } from "../sheet-view";
import { PROJECT_NODE_TYPE, type SheetNode, type SheetRow, type SheetTask } from "@/components/planning/sheet-types";

const task = (id: string, p: Partial<SheetTask> = {}): SheetRow => ({
  id: `task:${id}`, kind: "task", children: [],
  task: {
    id, project_id: "P", wbs_node_id: "n1", task_code: id.toUpperCase(), task_name: `Task ${id}`, status: "not_started",
    progress: 0, priority: "normal", discipline: null, owner_name: null, start_date: "2026-11-02", end_date: "2026-11-06",
    duration_days: 5, ...p,
  } as SheetTask,
});
const node = (id: string, children: SheetRow[], type = "level"): SheetRow => ({
  id: `node:${id}`, kind: "node", children,
  node: { id, project_id: "P", parent_id: null, node_type: type, wbs_code: id, wbs_name: id, sort_order: 0, progress_percent: 0 } as SheetNode,
  rollup: { progress: 0, start: null, end: null, taskCount: 0 },
});

const tree: SheetRow[] = [node("project:P", [
  node("L01", [task("a", { status: "in_progress", progress: 40, discipline: "STR", owner_name: "Dara" }), task("b", { progress: 100, status: "completed" })]),
  node("L02", [task("c", { discipline: "ARC", start_date: "2026-12-01", end_date: "2026-12-10", duration_days: 10 })]),
], PROJECT_NODE_TYPE)];

const float = new Map<string, TaskFloat>([
  ["a", { critical: true, nearCritical: false } as TaskFloat],
  ["c", { critical: false, nearCritical: true } as TaskFloat],
]);

const ids = (rows: SheetRow[]): string[] => rows.flatMap((r) => [r.id, ...ids(r.children)]);

describe("filterTree", () => {
  it("returns the tree unchanged without a filter", () => {
    expect(filterTree(tree, {}, float)).toBe(tree);
    expect(isFilterActive({ text: "  " })).toBe(false);
  });

  it("keeps matching tasks and their nodes, drops empty nodes but never the project row", () => {
    expect(ids(filterTree(tree, { incompleteOnly: true, criticalOnly: true }, float))).toEqual(["node:project:P", "node:L01", "task:a"]);
    expect(ids(filterTree(tree, { text: "zzz" }, float))).toEqual(["node:project:P"]);
    expect(ids(filterTree(tree, { statuses: ["completed"] }, float))).toEqual(["node:project:P", "node:L01", "task:b"]);
    expect(ids(filterTree(tree, { from: "2026-11-20" }, float))).toEqual(["node:project:P", "node:L02", "task:c"]);
    expect(ids(filterTree(tree, { discipline: "ARC" }, float))).toEqual(["node:project:P", "node:L02", "task:c"]);
  });
});

describe("groupTree", () => {
  it("leaves the WBS outline alone", () => {
    expect(groupTree(tree, "wbs", float)).toBe(tree);
  });

  it("groups tasks under read-only summary rows below the project row", () => {
    const g = groupTree(tree, "critical", float);
    expect(g).toHaveLength(1);
    expect(g[0].id).toBe("node:project:P");
    const groups = g[0].children;
    expect(groups.map((r) => (r.kind === "node" ? r.node.wbs_name : ""))).toEqual(["Critical (1)", "Near-critical (1)", "Not critical (1)"]);
    expect(groups.every((r) => r.id.startsWith(GROUP_ROW_PREFIX))).toBe(true);
  });

  it("puts empty values last and rolls up dates and duration-weighted progress", () => {
    const g = groupTree(tree, "discipline", float)[0].children;
    expect(g.map((r) => (r.kind === "node" ? r.node.wbs_name : ""))).toEqual(["ARC (1)", "STR (1)", "(none) (1)"]);
    const owners = groupTree(tree, "owner", float)[0].children;
    expect(owners.map((r) => (r.kind === "node" ? r.node.wbs_name : ""))).toEqual(["Dara (1)", "Unassigned (2)"]);
    const unassigned = owners[1];
    expect(unassigned.kind === "node" && unassigned.rollup).toEqual({ start: "2026-11-02", end: "2026-12-10", taskCount: 2, progress: 33 });
  });
});

describe("filterOptions", () => {
  it("lists distinct values", () => {
    const tasks = ids(tree).length ? [tree[0].children[0].children[0], tree[0].children[0].children[1], tree[0].children[1].children[0]]
      .map((r) => (r as Extract<SheetRow, { kind: "task" }>).task) : [];
    expect(filterOptions(tasks)).toEqual({ statuses: ["completed", "in_progress", "not_started"], disciplines: ["ARC", "STR"], owners: ["Dara"] });
  });
});
