import { describe, expect, it } from "vitest";
import { assignTemplates, generateBlockers, groupScope, pickTemplateVersion, recommendedKit, templatesForPart, type KitItem, type TemplateRef } from "../kit-plan";

const tpl = (id: string, code: string, version: number, status: string, parts: string[] = []): TemplateRef =>
  ({ id, code, name: code, version, status, applies_to_level_types: parts });

const templates = [
  tpl("gf1", "VILLA-GF", 1, "superseded"), tpl("gf2", "VILLA-GF", 2, "active"), tpl("gf3", "VILLA-GF", 3, "draft"),
  tpl("uf1", "VILLA-UF", 1, "draft"), tpl("uf2", "VILLA-UF", 2, "draft"),
  tpl("bsm", "BSM", 1, "approved"), tpl("rd", "ROAD", 1, "draft"), tpl("ut", "UTIL", 1, "draft"),
];

const items: KitItem[] = [
  { part: "basement", template_code: "BSM", building_types: ["luxury_villa"], sort_order: 10 },
  { part: "ground", template_code: "VILLA-GF", building_types: [], sort_order: 20 },
  { part: "typical", template_code: "VILLA-UF", building_types: [], sort_order: 50 },
  { part: "segment", template_code: "UTIL", building_types: [], sort_order: 71 },
  { part: "segment", template_code: "ROAD", building_types: [], sort_order: 70 },
];

describe("pickTemplateVersion", () => {
  it("uses active, else approved, else the newest draft; never superseded", () => {
    expect(pickTemplateVersion(templates, "VILLA-GF")?.id).toBe("gf2");
    expect(pickTemplateVersion(templates, "VILLA-UF")?.id).toBe("uf2");
    expect(pickTemplateVersion(templates, "BSM")?.id).toBe("bsm");
    expect(pickTemplateVersion([tpl("x", "OLD", 1, "superseded")], "OLD")).toBeNull();
  });
});

describe("templatesForPart / assignTemplates", () => {
  it("limits items to their building types and keeps kit order", () => {
    expect(templatesForPart(items, "basement", "luxury_villa", templates).map((t) => t.id)).toEqual(["bsm"]);
    expect(templatesForPart(items, "basement", "townhouse", templates)).toEqual([]);
    expect(templatesForPart(items, "segment", "road", templates).map((t) => t.code)).toEqual(["ROAD", "UTIL"]);
  });

  it("gives every node the templates of its part", () => {
    const a = assignTemplates([{ id: "G", part: "ground" }, { id: "L1", part: "typical" }, { id: "R", part: "roof" }, { id: "X", part: null }], items, "townhouse", templates);
    expect(a).toEqual({ G: ["gf2"], L1: ["uf2"], R: [], X: [] });
  });
});

describe("alternatives on a part", () => {
  const roofItems: KitItem[] = [
    { part: "roof", template_code: "PITCHED", building_types: [], sort_order: 60 },
    { part: "roof", template_code: "FLAT", building_types: [], sort_order: 61 },
  ];
  const roofs = [tpl("p", "PITCHED", 1, "draft"), tpl("f", "FLAT", 1, "draft")];
  it("keeps the templates whose conditions fit the planning choices", () => {
    expect(templatesForPart(roofItems, "roof", null, roofs, (t) => t.code === "FLAT").map((t) => t.code)).toEqual(["FLAT"]);
    expect(assignTemplates([{ id: "R", part: "roof" }], roofItems, null, roofs, (t) => t.code === "PITCHED")).toEqual({ R: ["p"] });
  });
  it("keeps all when none fits, so the planner sees why", () => {
    expect(templatesForPart(roofItems, "roof", null, roofs, () => false).map((t) => t.code)).toEqual(["PITCHED", "FLAT"]);
  });
});

describe("recommendedKit", () => {
  const kits = [
    { code: "KIT-VILLA", status: "draft", sectors: ["residential"], building_types: ["luxury_villa", "townhouse"] },
    { code: "KIT-VILLA-OLD", status: "superseded", sectors: ["residential"], building_types: ["luxury_villa"] },
    { code: "KIT-TOWER", status: "active", sectors: ["residential"], building_types: ["condominium"] },
    { code: "KIT-ROAD", status: "draft", sectors: ["infrastructure"], building_types: ["road"] },
  ] as const;
  const list = kits.map((k) => ({ ...k, sectors: [...k.sectors], building_types: [...k.building_types] })) as Parameters<typeof recommendedKit>[0];

  it("prefers the kit written for the building type", () => {
    expect(recommendedKit(list, { sector: "residential", buildingType: "townhouse" })?.code).toBe("KIT-VILLA");
    expect(recommendedKit(list, { sector: "infrastructure", buildingType: "road" })?.code).toBe("KIT-ROAD");
  });

  it("falls back to a usable kit of the sector, and to none without a category", () => {
    expect(recommendedKit(list, { sector: "residential", buildingType: "apartment" })?.code).toBe("KIT-TOWER");
    expect(recommendedKit(list, {})).toBeNull();
    expect(recommendedKit(list, { sector: "industrial", buildingType: "factory" })).toBeNull();
  });
});

describe("generateBlockers", () => {
  it("lists drafts of the kit and its templates", () => {
    expect(generateBlockers({ code: "K", status: "active" }, [{ code: "A", status: "approved" }])).toEqual([]);
    expect(generateBlockers({ code: "K", status: "draft" }, [{ code: "A", status: "draft" }])).toEqual(["Kit K is draft", "Template A is draft"]);
    expect(generateBlockers(null, [{ code: "A", status: "active" }])).toEqual([]);
  });
});

describe("groupScope", () => {
  const tree = [
    { id: "B1", parent_id: null, node_type: "building", wbs_name: "Villa A", wbs_code: "B1" },
    { id: "L0", parent_id: "B1", node_type: "level", wbs_name: "Ground", wbs_code: null },
    { id: "B2", parent_id: null, node_type: "building", wbs_name: "Clubhouse", wbs_code: "B2" },
    { id: "Z", parent_id: "B2", node_type: "zone", wbs_name: "Zone", wbs_code: null },
    { id: "L1", parent_id: "Z", node_type: "level", wbs_name: "Ground", wbs_code: null },
    { id: "RD", parent_id: null, node_type: "area", wbs_name: "Access Road", wbs_code: "RD1" },
    { id: "S1", parent_id: "RD", node_type: "segment", wbs_name: "CH 0+000 – 1+000", wbs_code: null },
    { id: "L9", parent_id: null, node_type: "level", wbs_name: "Loose level", wbs_code: null },
  ];
  it("groups levels by building (through zones), sections by route, the rest under Project", () => {
    const g = groupScope([{ id: "L0" }, { id: "L1" }, { id: "S1", node_type: "segment" }, { id: "L9" }], tree);
    expect(g.map((x) => [x.label, x.nodes.map((n) => n.id)])).toEqual([
      ["B1 · Villa A", ["L0"]], ["B2 · Clubhouse", ["L1"]], ["RD1 · Access Road", ["S1"]], ["Project-wide / site", ["L9"]],
    ]);
  });
});
