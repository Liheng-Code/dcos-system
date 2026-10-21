import { describe, expect, it } from "vitest";
import { codesToOverrides, overridesToCodes, startingKit, topUpScope } from "../generation-profile";
import { activityCounts } from "../generation-service";

const tpl = (id: string, code: string, version: number, status: string) => ({ id, code, name: code, version, status, applies_to_level_types: [] });
const templates = [tpl("a1", "A", 1, "superseded"), tpl("a2", "A", 2, "active"), tpl("b1", "B", 1, "draft")];

describe("override codes", () => {
  it("stores codes and restores the version Generate uses, for nodes that still exist", () => {
    const codes = overridesToCodes({ L1: ["a1", "b1"], L2: [] }, templates);
    expect(codes).toEqual({ L1: ["A", "B"], L2: [] });
    expect(codesToOverrides({ ...codes, GONE: ["A"] }, templates, new Set(["L1", "L2"]))).toEqual({ L1: ["a2", "b1"], L2: [] });
  });
});

describe("startingKit", () => {
  const kits = [
    { id: "v1", code: "KIT-VILLA", status: "superseded", version: 1 },
    { id: "v2", code: "KIT-VILLA", status: "draft", version: 2 },
    { id: "t1", code: "KIT-TOWER", status: "active", version: 1 },
  ] as Parameters<typeof startingKit>[0];
  const rec = kits[2];
  it("prefers the remembered kit, then the WBS template's, then the recommendation", () => {
    expect(startingKit(kits, "KIT-VILLA", "KIT-TOWER", rec)?.id).toBe("v2");
    expect(startingKit(kits, null, "KIT-VILLA", rec)?.id).toBe("v2");
    expect(startingKit(kits, "KIT-GONE", null, rec)?.id).toBe("t1");
    expect(startingKit(kits, null, null, null)).toBeNull();
  });
});

describe("top-up", () => {
  it("counts activities per target through packages and ticks only rows without", () => {
    const tree = [{ id: "L1", parent_id: "B" }, { id: "P", parent_id: "L1" }, { id: "L2", parent_id: "B" }, { id: "B", parent_id: null }];
    const counts = activityCounts(["L1", "L2"], tree, [{ wbs_node_id: "P" }, { wbs_node_id: "L1" }, { wbs_node_id: "B" }, { wbs_node_id: null }]);
    expect(counts).toEqual({ L1: 2, L2: 0 });
    expect(topUpScope(["L1", "L2"], counts)).toEqual({ picked: ["L2"], topUp: true });
    expect(topUpScope(["L1", "L2"], {})).toEqual({ picked: ["L1", "L2"], topUp: false });
  });
});
