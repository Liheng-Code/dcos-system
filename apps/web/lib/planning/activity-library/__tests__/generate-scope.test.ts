import { describe, expect, it } from "vitest";
import { partLabel } from "../part-labels";
import { canGenerateFrom, existingMasterKeys, inferLevelType, siteTargets } from "../generation-service";

describe("partLabel", () => {
  it("names building parts", () => {
    expect(partLabel("typical", { sector: "commercial", buildingType: "office_building" })).toBe("Typical floor");
    expect(partLabel("typical", { sector: "residential", buildingType: "luxury_villa" })).toBe("Upper floor");
    expect(partLabel("segment", {})).toBe("Chainage section");
  });

  it("names infrastructure and industrial parts in their own words", () => {
    const bridge = { sector: "infrastructure", buildingType: "bridge" };
    expect(["basement", "ground", "typical", "roof"].map((t) => partLabel(t, bridge))).toEqual(["Foundations", "Substructure", "Spans", "Deck"]);
    expect(partLabel("basement", { sector: "infrastructure", buildingType: "water_supply" })).toBe("Pump station");
    expect(partLabel("basement", { sector: "industrial", buildingType: "factory" })).toBe("Pits & trenches");
  });

  it("returns empty for no type and the raw value for an unknown one", () => {
    expect(partLabel(null, {})).toBe("");
    expect(partLabel("plant_room", {})).toBe("plant room");
  });
});

describe("existingMasterKeys", () => {
  // building B > level L1 > package P > sub-package Q; level L2 directly under B
  const tree = [
    { id: "B", parent_id: null }, { id: "L1", parent_id: "B" }, { id: "P", parent_id: "L1" },
    { id: "Q", parent_id: "P" }, { id: "L2", parent_id: "B" },
  ];
  const codes = new Map([["m1", "CONC"], ["m1v2", "CONC"], ["m2", "BRICK"]]);

  it("credits an activity in a package to the level above it, by master code", () => {
    const keys = existingMasterKeys(["L1", "L2"], tree, [
      { wbs_node_id: "Q", activity_master_id: "m1" },
      { wbs_node_id: "L2", activity_master_id: "m1v2" },
      { wbs_node_id: "B", activity_master_id: "m2" },
      { wbs_node_id: "P", activity_master_id: null },
    ], codes);
    expect([...keys].sort()).toEqual(["L1|CONC", "L2|CONC"]);
  });

  it("ignores levels that are not targets", () => {
    expect(existingMasterKeys(["L2"], tree, [{ wbs_node_id: "Q", activity_master_id: "m1" }], codes).size).toBe(0);
  });
});

describe("siteTargets", () => {
  const n = (id: string, parent_id: string | null, sort_order = 0) =>
    ({ id, parent_id, wbs_code: id, wbs_name: id, level_type: null, sort_order, node_type: "task_group" });
  it("keeps the top-most External Works nodes as part site", () => {
    const out = siteTargets([n("EXT", "ROOT", 2), n("EXT-DRN", "EXT"), n("EXT-LND", "EXT"), n("B2-EXT", "B2", 1)]);
    expect(out.map((x) => [x.id, x.level_type])).toEqual([["B2-EXT", "site"], ["EXT", "site"]]);
    expect(inferLevelType(out[0])).toBe("site");
    expect(partLabel("site", {})).toBe("Site / external works");
  });
});

describe("canGenerateFrom", () => {
  it("allows approved and active, not draft", () => {
    expect(["active", "approved", "draft", "superseded"].map(canGenerateFrom)).toEqual([true, true, false, false]);
  });
});
