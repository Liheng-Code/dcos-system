import { describe, expect, it } from "vitest";
import {
  expandWbsTemplate,
  floorTypeOf,
  nodeKeys,
  parseWbsTemplateDoc,
  projectWbsToTemplate,
  suggestBlocks,
  suggestContainer,
  type SrcNode,
  type SrcTask,
} from "../wbs-template";
import type { LevelItem } from "@/lib/level-library";

// A small project shaped like PRJ-2026-004-PC: fixed Design section + Construction > Main Building > floors.
const N = (id: string, parent: string | null, code: string, name: string, sort: number, type = "task_group"): SrcNode =>
  ({ id, parent_id: parent, node_type: type, wbs_code: code, wbs_name: name, sort_order: sort });
const nodes: SrcNode[] = [
  N("d", null, "01", "DESIGN", 1, "phase"),
  N("d1", "d", "01", "ARCHITECTURAL DESIGN", 1),
  N("c", null, "03", "CONSTRUCTION", 3, "phase"),
  N("ba", "c", "01", "BA – MAIN BUILDING", 1),
  N("b1", "ba", "01", "B1 – BASEMENT / UNDERGROUND", 1),
  N("b1e", "b1", "01", "EARTHWORK", 1),
  N("gf", "ba", "02", "GF", 2),
  N("gfs", "gf", "01", "STRUCTURAL WORKS", 1),
  N("f1", "ba", "03", "1F", 3),
  N("f1s", "f1", "01", "STRUCTURAL WORKS", 1),
  N("f2", "ba", "04", "2F", 4),
  N("f2s", "f2", "01", "STRUCTURAL WORKS", 1),
  N("rf", "ba", "05", "RF – ROOF", 5),
  N("rfw", "rf", "01", "ROOF WORKS", 1),
  N("bx", "c", "02", "BX – EXTERNAL WORKS", 2),
];
const T = (id: string, node: string, name: string, sort: number, deps: string[] = []): SrcTask => ({
  id, wbs_node_id: node, task_name: name, sort_order: sort, duration_days: 5, discipline: "Structural",
  dependency_task_ids: deps, dependency_types: deps.map(() => "fs"), dependency_lag_days: deps.map(() => 0),
});
const tasks: SrcTask[] = [
  T("t-d1", "d1", "Concept design", 1),
  T("t-d2", "d1", "Detailed design", 2, ["t-d1"]),
  T("t-b1", "b1e", "Excavation", 1, ["t-d2"]),
  T("t-gf1", "gfs", "Setting out", 1),
  T("t-gf2", "gfs", "Columns", 2, ["t-gf1"]),
  T("t-11", "f1s", "Setting out", 1, ["t-gf2"]), // links to the floor below
  T("t-12", "f1s", "Columns", 2, ["t-11", "t-d2"]),
  T("t-21", "f2s", "Setting out", 1, ["t-12"]),
  T("t-22", "f2s", "Columns", 2, ["t-21"]),
  T("t-r1", "rfw", "Roof slab", 1),
];

const lvl = (code: string, type: LevelItem["level_type"]): LevelItem =>
  ({ level_code: code, level_name: code, level_type: type, floor_height_m: null, typical_gfa_m2: null });

describe("suggestions", () => {
  it("reads floor types from names", () => {
    expect(floorTypeOf({ wbs_name: "B1 – BASEMENT / UNDERGROUND", wbs_code: "01", node_type: "task_group" })).toBe("basement");
    expect(floorTypeOf({ wbs_name: "GF", wbs_code: "02", node_type: "task_group" })).toBe("ground");
    expect(floorTypeOf({ wbs_name: "1F", wbs_code: "03", node_type: "task_group" })).toBe("typical");
    expect(floorTypeOf({ wbs_name: "RF – ROOF", wbs_code: "05", node_type: "task_group" })).toBe("roof");
    expect(floorTypeOf({ wbs_name: "STRUCTURAL WORKS", wbs_code: "01", node_type: "task_group" })).toBeNull();
  });

  it("finds the building container and one floor per block type", () => {
    expect(suggestContainer(nodes)).toBe("ba");
    const floors = nodes.filter((n) => n.parent_id === "ba");
    expect(suggestBlocks(floors)).toEqual({ basement: "b1", ground: "gf", typical: "f1", roof: "rf" });
  });
});

describe("projectWbsToTemplate", () => {
  const { doc, droppedFloors, droppedTasks, droppedLinks } = projectWbsToTemplate(
    { nodes, tasks },
    { containerId: "ba", blocks: { basement: "b1", ground: "gf", typical: "f1", roof: "rf" } },
  );

  it("keeps fixed sections (incl. siblings of the building) and anchors buildings under Construction", () => {
    expect(doc.sections.nodes.map((n) => n.key)).toEqual(["01", "01.01", "03", "03.02"]);
    expect(doc.building_anchor_key).toBe("03");
    expect(doc.sections.tasks.map((t) => t.key)).toEqual(["01.01.01", "01.01.02"]);
  });

  it("captures one block per floor type with keys relative to the floor", () => {
    expect(doc.floor_blocks.typical!.nodes.map((n) => [n.key, n.parent_key])).toEqual([["01", ""]]);
    expect(doc.floor_blocks.typical!.tasks.map((t) => t.key)).toEqual(["01.01", "01.02"]);
    expect(doc.floor_blocks.basement!.tasks).toHaveLength(1);
    expect(doc.floor_blocks.roof!.tasks).toHaveLength(1);
  });

  it("re-expresses links as same-floor / previous-floor / section links", () => {
    const [setting, columns] = doc.floor_blocks.typical!.tasks;
    expect(setting.predecessors).toEqual([{ key: "01.02", scope: "prev_floor", type: "fs", lag: 0 }]);
    expect(columns.predecessors).toEqual([
      { key: "01.01", scope: "same", type: "fs", lag: 0 },
      { key: "01.01.02", scope: "sections", type: "fs", lag: 0 },
    ]);
    expect(doc.floor_blocks.basement!.tasks[0].predecessors[0].scope).toBe("sections");
  });

  it("drops repeated floors (2F) and their tasks", () => {
    expect(droppedFloors).toBe(1);
    expect(droppedTasks).toBe(2);
    expect(droppedLinks).toBe(0);
  });

  it("round-trips through the stored-content parser", () => {
    expect(parseWbsTemplateDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    expect(parseWbsTemplateDoc({}).sections.nodes).toEqual([]);
  });

  it("without a container, the whole tree is fixed sections", () => {
    const r = projectWbsToTemplate({ nodes, tasks }, { containerId: null, blocks: {} });
    expect(r.doc.sections.nodes).toHaveLength(nodes.length);
    expect(r.doc.sections.tasks).toHaveLength(tasks.length);
    expect(r.doc.floor_blocks).toEqual({});
  });

  describe("expandWbsTemplate", () => {
    const { payload, levels } = expandWbsTemplate(doc, [
      { code: "b01", name: "Tower", levels: [lvl("B1", "basement"), lvl("GF", "ground"), lvl("L01", "typical"), lvl("L02", "typical"), lvl("L03", "typical"), lvl("RF", "roof")] },
    ]);

    it("creates sections, the building under the anchor, levels and a block per level", () => {
      const keys = payload.nodes.map((n) => n.key);
      expect(keys).toContain("03.B01");
      expect(keys).toContain("03.B01.L03.01");
      expect(keys).toContain("03.B01.B1.01");
      expect(new Set(keys).size).toBe(keys.length);
      // 4 sections + building + 6 levels + 6 block nodes
      expect(payload.nodes).toHaveLength(17);
      // 2 sections + 1 basement + 2 ground + 3×2 typical + 1 roof
      expect(payload.tasks).toHaveLength(12);
      expect(levels.map((l) => l.key)).toEqual(["03.B01.B1", "03.B01.GF", "03.B01.L01", "03.B01.L02", "03.B01.L03", "03.B01.RF"]);
    });

    it("re-bases links per floor; the first floor's previous-floor link points at the floor below", () => {
      const byCode = new Map(payload.tasks.map((t) => [t.task_code, t]));
      expect(byCode.get("03.B01.L02.01.01")!.predecessors).toEqual([{ code: "03.B01.L01.01.02", type: "fs", lag: 0 }]);
      expect(byCode.get("03.B01.L01.01.01")!.predecessors).toEqual([{ code: "03.B01.GF.01.02", type: "fs", lag: 0 }]);
      expect(byCode.get("03.B01.L01.01.02")!.predecessors.map((p) => p.code)).toEqual(["03.B01.L01.01.01", "01.01.02"]);
      expect(byCode.get("03.B01.L02.01.01")!.area_label).toBe("L02");
    });

    it("attaches to an existing building and level without re-creating them", () => {
      const r = expandWbsTemplate(doc, [
        { code: "B01", name: "Tower", parentKey: null, existing: true, levels: [{ ...lvl("GF", "ground"), existing: true }] },
      ]);
      expect(r.payload.nodes.find((n) => n.key === "B01")).toBeUndefined();
      expect(r.payload.nodes.find((n) => n.key === "B01.GF.01")).toBeDefined();
      expect(r.levels).toEqual([]);
    });

    it("rejects duplicate buildings or levels", () => {
      expect(() => expandWbsTemplate(doc, [{ code: "A", name: "", levels: [] }, { code: "a", name: "", levels: [] }])).toThrow();
      expect(() => expandWbsTemplate(doc, [{ code: "A", name: "", levels: [lvl("GF", "ground"), lvl("gf", "ground")] }])).toThrow();
    });
  });
});

describe("nodeKeys", () => {
  it("builds dotted code chains", () => {
    const k = nodeKeys(nodes);
    expect(k.get("f1s")).toBe("03.01.03.01");
    expect(k.get("d")).toBe("01");
  });
});

describe("template editing", () => {
  const base = projectWbsToTemplate({ nodes, tasks }, { containerId: "ba", blocks: { basement: "b1", ground: "gf", typical: "f1", roof: "rf" } }).doc;

  it("adds nodes and activities with the next free code", async () => {
    const { addTemplateNode, addTemplateTask } = await import("../wbs-template");
    const r = addTemplateNode(base, "typical", "", "MEP FIRST FIX");
    expect(r.key).toBe("02");
    const d = addTemplateTask(r.doc, "typical", "02", "Conduits");
    expect(d.floor_blocks.typical!.tasks.at(-1)).toMatchObject({ key: "02.01", node_key: "02", task_name: "Conduits" });
  });

  it("removing a node drops its activities and links to them everywhere", async () => {
    const { removeTemplateNode } = await import("../wbs-template");
    const d = removeTemplateNode(base, "sections", "01");
    expect(d.sections.nodes.map((n) => n.key)).toEqual(["03", "03.02"]);
    expect(d.sections.tasks).toEqual([]);
    expect(d.floor_blocks.typical!.tasks[1].predecessors.map((p) => p.scope)).toEqual(["same"]);
    expect(d.floor_blocks.basement!.tasks[0].predecessors).toEqual([]);
    // removing the anchor clears it
    expect(removeTemplateNode(base, "sections", "03").building_anchor_key).toBeNull();
  });

  it("removing a block activity drops same-block and previous-floor links to it", async () => {
    const { removeTemplateTask } = await import("../wbs-template");
    const d = removeTemplateTask(base, "typical", "01.02");
    expect(d.floor_blocks.typical!.tasks.map((t) => t.key)).toEqual(["01.01"]);
    expect(d.floor_blocks.typical!.tasks[0].predecessors).toEqual([]);
  });

  it("moves a node among its siblings", async () => {
    const { moveTemplateNode } = await import("../wbs-template");
    const d = moveTemplateNode(base, "sections", "03", -1);
    const order = [...d.sections.nodes].filter((n) => n.parent_key === "").sort((a, b) => a.sort_order - b.sort_order).map((n) => n.key);
    expect(order).toEqual(["03", "01"]);
  });
});

describe("template selection", () => {
  const base = projectWbsToTemplate({ nodes, tasks }, { containerId: "ba", blocks: { basement: "b1", ground: "gf", typical: "f1", roof: "rf" } }).doc;

  it("unticking a package marks it off and its parent partial", async () => {
    const m = await import("../wbs-template");
    const sel = m.toggleNodeSelection(base.sections, m.emptyPartSelection(), "01.01", false);
    expect(m.nodeCheckState(sel, "01.01")).toBe("off");
    expect(m.nodeCheckState(sel, "01")).toBe("partial");
    expect(m.nodeCheckState(sel, "03")).toBe("on");
    expect(m.taskIncluded(sel, { key: "01.01.01", node_key: "01.01" })).toBe(false);
  });

  it("re-ticking one activity under an unticked package keeps its siblings off", async () => {
    const m = await import("../wbs-template");
    let sel = m.toggleNodeSelection(base.sections, m.emptyPartSelection(), "01", false);
    sel = m.toggleTaskSelection(base.sections, sel, { key: "01.01.02", node_key: "01.01" }, true);
    expect(m.taskIncluded(sel, { key: "01.01.02", node_key: "01.01" })).toBe(true);
    expect(m.taskIncluded(sel, { key: "01.01.01", node_key: "01.01" })).toBe(false);
    expect(m.nodeCheckState(sel, "01")).toBe("partial");
  });

  it("ticking a package back clears everything unticked below it", async () => {
    const m = await import("../wbs-template");
    let sel = m.toggleTaskSelection(base.sections, m.emptyPartSelection(), { key: "01.01.01", node_key: "01.01" }, false);
    sel = m.toggleNodeSelection(base.sections, sel, "01", true);
    expect(sel.tasks.size + sel.nodes.size).toBe(0);
  });

  it("applies the selection and counts links dropped to unticked activities", async () => {
    const m = await import("../wbs-template");
    const sel = m.toggleTaskSelection(base.sections, m.emptyPartSelection(), { key: "01.01.02", node_key: "01.01" }, false);
    const r = m.applyTemplateSelection(base, { sections: sel });
    expect(r.doc.sections.tasks.map((t) => t.key)).toEqual(["01.01.01"]);
    // 01.01.02 was linked from the basement and typical blocks (2 links); its own link is not counted.
    expect(r.droppedLinks).toBe(2);
    expect(r.doc.floor_blocks.basement!.tasks[0].predecessors).toEqual([]);
  });

  it("unticking a block package removes it from every floor of that type", async () => {
    const m = await import("../wbs-template");
    const sel = m.toggleNodeSelection(base.floor_blocks.typical!, m.emptyPartSelection(), "01", false);
    const r = m.applyTemplateSelection(base, { typical: sel });
    const e = expandWbsTemplate(r.doc, [{ code: "B", name: "", levels: [lvl("L1", "typical"), lvl("L2", "typical")] }]);
    expect(e.payload.nodes.some((n) => n.key.startsWith("03.B.L1."))).toBe(false);
    expect(e.payload.tasks.some((t) => t.task_code.startsWith("03.B.L2."))).toBe(false);
  });
});
