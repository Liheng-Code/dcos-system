import { describe, expect, it } from "vitest";
import {
  COLUMN_PRESETS,
  activityRollup,
  attachActivities,
  buildWbsTree,
  countVisible,
  openMapFor,
  rowDepths,
  visibleColumnsFor,
  DEFAULT_VIEW,
  type WbsActivitySummary,
  type WbsBuilderNode,
} from "../wbs-builder-types";

const node = (id: string, parent: string | null, code: string, sort = 0): WbsBuilderNode => ({
  id, project_id: "p", parent_id: parent, node_type: "task_group", wbs_code: code, wbs_name: code, full_path: null,
  sort_order: sort, status: "active", progress_percent: 0, discipline: null, area_label: null, cost_code: null,
  is_below_ground: null, is_external_works: null, is_locked: false, locked_at: null, locked_by: null,
});
// Construction (L1) > Tower (L2) > GF (L3) > Structural (L4)
const nodes = [node("c", null, "03"), node("t", "c", "01"), node("gf", "t", "01"), node("s", "gf", "01")];
const act = (id: string, nodeId: string, progress: number, duration: number): WbsActivitySummary => ({
  id, wbs_node_id: nodeId, task_code: id, task_name: id, status: "not_started", progress, duration_days: duration, discipline: null, sort_order: 0,
});
const acts = [act("a1", "s", 100, 2), act("a2", "s", 0, 2), act("a3", "gf", 50, 4)];
const project = { id: "p", project_code: "P", project_name: "P", project_status: "draft", progress_percentage: 0 };

describe("columns", () => {
  it("always keeps code, name and actions, in the fixed order", () => {
    expect(visibleColumnsFor(["gfa", "cost_code"]).map((c) => c.field)).toEqual(["wbs_code", "wbs_name", "cost_code", "gfa", "action"]);
  });
  it("defaults to the Standard preset with Activities", () => {
    expect(DEFAULT_VIEW.columns).toEqual(COLUMN_PRESETS[0].columns);
    expect(DEFAULT_VIEW.columns).toContain("activities");
  });
});

describe("activities", () => {
  it("rolls activity count and duration-weighted progress up the tree", () => {
    const r = activityRollup(nodes, acts);
    expect(r.get("s")).toMatchObject({ count: 2, progress: 50 });
    // gf: a1 (100%, 2d) + a2 (0%, 2d) + a3 (50%, 4d) → 4 of 8 days = 50%
    expect(r.get("gf")).toMatchObject({ count: 3, progress: 50 });
    expect(r.get("c")?.count).toBe(3);
  });

  it("appends activity rows after a package's child nodes", () => {
    const tree = attachActivities(buildWbsTree(nodes), acts);
    const gf = tree[0].children[0].children[0];
    expect(gf.children.map((r) => r.id)).toEqual(["node:s", "task:a3"]);
    expect(gf.children[1].task?.task_name).toBe("a3");
    expect(gf.children[1].node.id).toBe("gf");
  });
});

describe("depth", () => {
  const tree = buildWbsTree(nodes, project); // project row is depth 0

  it("gives every row its depth", () => {
    const d = rowDepths(tree);
    expect(d.get("node:project:p")).toBe(0);
    expect(d.get("node:s")).toBe(4);
  });

  it("level 2 shows project, phases and buildings", () => {
    const open = openMapFor(tree, { ...DEFAULT_VIEW, depth: 2 });
    expect(open).toMatchObject({ "node:project:p": true, "node:c": true, "node:t": false });
    expect(countVisible(tree, open)).toBe(3);
  });

  it("'all' opens everything", () => {
    expect(countVisible(tree, openMapFor(tree, { ...DEFAULT_VIEW, depth: "all" }))).toBe(5);
  });

  it("with activities on, a package at the chosen depth shows its activities", () => {
    const withActs = attachActivities(tree, acts);
    const open = openMapFor(withActs, { ...DEFAULT_VIEW, depth: 4, showActivities: true });
    expect(open["node:s"]).toBe(true); // only activities below → open
    expect(open["node:gf"]).toBe(true);
    expect(countVisible(withActs, open)).toBe(5 + 3);
  });
});

describe("WBS code display (same as Planning)", () => {
  // Phase 03 > Tower 01 > GF > Structural 01, with activities on GF and Structural.
  const tree = attachActivities(buildWbsTree(nodes, project), acts);

  it("numbers by position with the default mask: packages first, then activities", async () => {
    const { wbsDisplayCodes } = await import("../wbs-builder-types");
    const { DEFAULT_MASK } = await import("@/lib/planning/wbs-code-mask");
    const codes = wbsDisplayCodes(tree, DEFAULT_MASK);
    expect(codes.get("node:c")).toBe("01");
    expect(codes.get("node:t")).toBe("01.01");
    expect(codes.get("node:gf")).toBe("01.01.01");
    expect(codes.get("node:s")).toBe("01.01.01.01");
    expect(codes.get("task:a1")).toBe("01.01.01.01.01");
    // GF's own activity comes after its child package
    expect(codes.get("task:a3")).toBe("01.01.01.02");
    expect(codes.has("node:project:p")).toBe(false);
  });

  it("uses the project's mask and saved codes", async () => {
    const { wbsDisplayCodes } = await import("../wbs-builder-types");
    const mask = { prefix: "HTBT-", levels: [{ sequence: "upper" as const, length: null, separator: "-" }, { sequence: "numbers" as const, length: 3, separator: "." }], generateForNew: true, verifyUnique: true };
    const withOverride = attachActivities(buildWbsTree(nodes.map((n) => (n.id === "t" ? { ...n, wbs_outline_code: "X-99" } : n)), project), acts);
    const codes = wbsDisplayCodes(withOverride, mask);
    expect(codes.get("node:c")).toBe("HTBT-A");
    expect(codes.get("node:t")).toBe("X-99");
    expect(codes.get("node:gf")).toBe("HTBT-A-001.001");
  });
});
