import { describe, expect, it } from "vitest";
import { parseWbsTemplateDoc } from "../wbs-template";
import { constructionPhaseKeys, coveragePercent, isFreeTaskAllowed, taskLinkStatus, templateCoverage } from "../template-activity-rules";

const node = (key: string, parent: string, name: string, cost: string | null = null) => ({
  key, parent_key: parent, wbs_code: key, wbs_name: name, node_type: parent ? "task_group" : "phase", cost_code: cost, sort_order: 10,
});
const task = (key: string, nodeKey: string, name: string, o: Record<string, unknown> = {}) => ({
  key, node_key: nodeKey, task_name: name, sort_order: 10, duration_days: 5, discipline: "Structural", predecessors: [], ...o,
});

const doc = parseWbsTemplateDoc({
  schema: 1,
  building_anchor_key: "03",
  sections: {
    nodes: [node("01", "", "DESIGN & ENGINEERING", "D-1000"), node("03", "", "CONSTRUCTION", "C-3000"), node("03.01", "03", "PRELIMINARIES"),
      node("04", "", "TESTING, COMMISSIONING & HANDOVER", "H-4000")],
    tasks: [
      task("01.01", "01", "Design Brief", { discipline: "Design" }),
      task("03.01.01", "03.01", "Site Office", { discipline: "Construction", master_code: "PRE-TMP-002" }),
      task("03.01.02", "03.01", "Hoarding", { discipline: "Construction" }),
      task("03.01.03", "03.01", "Method statements", { discipline: "Documentation" }),
      task("04.01", "04", "Handover", { discipline: "Handover" }),
    ],
  },
  floor_blocks: {
    typical: {
      nodes: [node("01", "", "STRUCTURAL WORKS")],
      tasks: [task("01.01", "01", "Column Concrete", { master_code: "STR-RC-COL-003" }), task("01.02", "01", "Floor complete", { is_milestone: true }),
        task("01.03", "01", "Waterstops"), task("01.04", "01", "Old link", { master_code: "GONE-001" })],
    },
  },
});

describe("template activity rules", () => {
  it("finds the Construction phase by name or C- cost code", () => {
    expect([...constructionPhaseKeys(doc.sections.nodes)]).toEqual(["03"]);
    expect([...constructionPhaseKeys([{ key: "05", parent_key: "", wbs_name: "Works", cost_code: "C-5000" }])]).toEqual(["05"]);
    expect(constructionPhaseKeys([{ key: "04", parent_key: "", wbs_name: "Construction commissioning", cost_code: null }]).size).toBe(0);
  });

  it("lets non-construction phases, milestones and non-work disciplines stay free", () => {
    const keys = new Set(["03"]);
    expect(isFreeTaskAllowed({ node_key: "01", discipline: "Design", is_milestone: false }, "sections", keys)).toBe(true);
    expect(isFreeTaskAllowed({ node_key: "03.01", discipline: "Construction", is_milestone: false }, "sections", keys)).toBe(false);
    expect(isFreeTaskAllowed({ node_key: "03.01", discipline: "QA/QC", is_milestone: false }, "sections", keys)).toBe(true);
    expect(isFreeTaskAllowed({ node_key: "01", discipline: "Structural", is_milestone: false }, "typical", keys)).toBe(false);
    expect(isFreeTaskAllowed({ node_key: "01", discipline: "Structural", is_milestone: true }, "typical", keys)).toBe(true);
  });

  it("tells linked, missing, free and unknown links apart", () => {
    const keys = new Set(["03"]);
    const known = new Set(["STR-RC-COL-003"]);
    expect(taskLinkStatus({ node_key: "01", discipline: "Structural", is_milestone: false, master_code: "STR-RC-COL-003" }, "typical", keys, known)).toBe("linked");
    expect(taskLinkStatus({ node_key: "01", discipline: "Structural", is_milestone: false, master_code: null }, "typical", keys, known)).toBe("missing");
    expect(taskLinkStatus({ node_key: "01", discipline: "Design", is_milestone: false, master_code: null }, "sections", keys, known)).toBe("free");
    expect(taskLinkStatus({ node_key: "01", discipline: "Structural", is_milestone: false, master_code: "GONE-001" }, "typical", keys, known)).toBe("unknown_activity");
  });

  it("measures a template's coverage", () => {
    const c = templateCoverage(doc, new Set(["PRE-TMP-002", "STR-RC-COL-003"]));
    expect(c).toMatchObject({ mustLink: 5, linked: 2, free: 4 });
    expect(c.missing.map((m) => `${m.part}:${m.name}`)).toEqual(["sections:Hoarding", "typical:Waterstops"]);
    expect(c.unknown.map((u) => u.code)).toEqual(["GONE-001"]);
    expect(coveragePercent(c)).toBe(40);
    expect(coveragePercent({ mustLink: 0, linked: 0 })).toBe(100);
  });
});
