import { describe, expect, it } from "vitest";
import { masterWbsRowsToSrc, parseMasterWbsRows } from "../master-wbs-sheet";
import { projectWbsToTemplate, suggestBlocks, suggestContainer } from "../wbs-template";

const row = (code: string, name: string, type: string, extra: Record<string, unknown> = {}) =>
  ({ "WBS Code": code, "Activity / Work Package": name, Type: type, "Duration (Days)": "", Predecessors: "", ...extra });

const sheet = [
  row("0", "Mixed-use 7F", "Project"),
  row("01", "DESIGN", "Phase"),
  row("01.01", "Concept design", "Activity", { "Duration (Days)": "10" }),
  row("03", "CONSTRUCTION", "Phase"),
  row("03.01", "BA – MAIN BUILDING", "Work Package"),
  row("03.01.01", "GF", "Work Package"),
  row("03.01.01.01", "STRUCTURAL WORKS", "Work Package"),
  row("03.01.01.01.01", "Columns", "Activity", { "Duration (Days)": "5", Predecessors: "01.01" }),
  row("03.01.02", "1F", "Work Package"),
  row("03.01.02.01", "STRUCTURAL WORKS", "Work Package"),
  row("03.01.02.01.01", "Columns", "Activity", { "Duration (Days)": "5", Predecessors: "03.01.01.01.01" }),
  row("03.01.03", "2F", "Work Package"),
  row("03.01.03.01", "STRUCTURAL WORKS", "Work Package"),
  row("03.01.03.01.01", "Columns", "Activity", { "Duration (Days)": "5", Predecessors: "03.01.02.01.01" }),
  row("03.01.04", "RF – ROOF", "Work Package"),
  row("03.01.04.01", "ROOF WORKS", "Work Package"),
];

describe("Master WBS sheet → template", () => {
  it("parses rows and builds a WBS without the Project row", () => {
    const src = masterWbsRowsToSrc(parseMasterWbsRows(sheet));
    expect(src.nodes.map((n) => n.id)).toEqual([
      "01", "03", "03.01", "03.01.01", "03.01.02", "03.01.03", "03.01.04",
      "03.01.01.01", "03.01.02.01", "03.01.03.01", "03.01.04.01",
    ]);
    expect(src.tasks).toHaveLength(4);
    expect(src.tasks.find((t) => t.id === "03.01.02.01.01")!.dependency_task_ids).toEqual(["03.01.01.01.01"]);
  });

  it("feeds the same floor-block conversion as a project WBS", () => {
    const src = masterWbsRowsToSrc(parseMasterWbsRows(sheet));
    const containerId = suggestContainer(src.nodes);
    expect(containerId).toBe("03.01");
    const blocks = suggestBlocks(src.nodes.filter((n) => n.parent_id === containerId));
    expect(blocks).toEqual({ ground: "03.01.01", typical: "03.01.02", roof: "03.01.04" });
    const { doc } = projectWbsToTemplate(src, { containerId, blocks });
    expect(doc.building_anchor_key).toBe("03");
    expect(doc.floor_blocks.typical!.tasks[0]).toMatchObject({
      task_name: "Columns", duration_days: 5,
      predecessors: [{ key: "01.01", scope: "prev_floor", type: "fs", lag: 0 }],
    });
    expect(doc.floor_blocks.ground!.tasks[0].predecessors).toEqual([{ key: "01.01", scope: "sections", type: "fs", lag: 0 }]);
  });

  it("rejects a sheet without the required columns", () => {
    expect(() => parseMasterWbsRows([{ Foo: "1" }])).toThrow(/Missing required columns/);
  });
});

describe("Building / Level rows", () => {
  it("become real building and level nodes; basement levels are below ground", () => {
    const rows = parseMasterWbsRows([
      row("03", "CONSTRUCTION", "Phase"),
      row("03.01", "TOWER A", "Building"),
      row("03.01.01", "B1 BASEMENT", "Level"),
      row("03.01.02", "GROUND FLOOR", "Floor"),
      row("03.01.02.01", "STRUCTURAL WORKS", "Work Package"),
    ]);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    expect(byKey.get("03.01")).toMatchObject({ kind: "node", nodeType: "building" });
    expect(byKey.get("03.01.01")).toMatchObject({ kind: "node", nodeType: "level", isBelowGround: true });
    expect(byKey.get("03.01.02")).toMatchObject({ nodeType: "level", isBelowGround: false });
    expect(byKey.get("03.01.02.01")!.nodeType).toBe("task_group");
    expect(rows.every((r) => r.warnings.length === 0)).toBe(true);
  });
});
