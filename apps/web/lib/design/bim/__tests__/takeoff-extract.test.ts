import { describe, expect, it } from "vitest";
import { describeExtraction, extractTakeoffRows } from "../takeoff-extract";
import type { SpatialTreeNode } from "../bim-types";

const v = (value: unknown) => ({ value });
const qto = (...q: [string, string, number][]) => ({ Name: v("Qto"), Quantities: q.map(([name, key, val]) => ({ Name: v(name), [key]: v(val) })) });

const node = (name: string, type: SpatialTreeNode["type"], expressId: number | undefined, children: SpatialTreeNode[] = []): SpatialTreeNode =>
  ({ id: `${name}-${expressId}`, name, type, expressId, children, visible: true });

/** a small model exported in millimetres */
function model() {
  return [
    { _category: v("IFCSIUNIT"), UnitType: v(".LENGTHUNIT."), Prefix: v(".MILLI.") },
    // slab with standard base quantities and a containment relation
    { _category: v("IFCSLAB"), _localId: v(1), _guid: v("S1"), Name: v("Slab A"), ContainedInStructure: [{ Name: v("Level 1") }],
      IsDefinedBy: [qto(["NetVolume", "VolumeValue", 18_000_000_000], ["NetArea", "AreaValue", 90_000_000])] },
    // column: storey only from the spatial tree
    { _category: v("IFCCOLUMN"), _localId: v(2), _guid: v("C1"), IsDefinedBy: [qto(["NetVolume", "VolumeValue", 900_000_000])] },
    // beam: nothing to measure
    { _category: v("IFCBEAM"), _localId: v(3), _guid: v("B1"), Name: v("Beam") },
    // rebar: derive weight
    { _category: v("IFCREINFORCINGBAR"), _localId: v(4), _guid: v("R1"), NominalDiameter: v(16), BarLength: v(6000), ContainedInStructure: [{ Name: v("Level 1") }] },
    // project parameter present: it wins over the IFC quantity
    { _category: v("IFCSLAB"), _localId: v(5), _guid: v("S2"), Volume: v(12.5), "Reference Level": v("L02"),
      IsDefinedBy: [qto(["NetVolume", "VolumeValue", 99_000_000_000])] },
    // records that carry a GlobalId but are not elements
    { _category: v("IFCPROPERTYSET"), _localId: v(6), _guid: v("P1") },
    { _category: v("IFCRELDEFINESBYPROPERTIES"), _localId: v(7), _guid: v("RL1") },
    { _category: v("IFCSLABTYPE"), _localId: v(8), _guid: v("T1") },
    // no GlobalId at all
    { _category: v("IFCCARTESIANPOINT"), _localId: v(9) },
  ];
}

const tree = [node("Project", "project", 100, [node("Site", "site", 101, [node("Building", "building", 102, [node("Level 2", "storey", 103, [node("Column", "element", 2)])])])])];

describe("extractTakeoffRows", () => {
  const { rows, stats } = extractTakeoffRows(model(), { spatialTree: tree });
  const by = (g: string) => rows.find((r) => r.global_id === g)!;

  it("keeps only real elements and counts what it skipped", () => {
    expect(rows.map((r) => r.global_id).sort()).toEqual(["B1", "C1", "R1", "S1", "S2"]);
    expect(stats.skippedNonElements).toBe(3);
    expect(stats.elements).toBe(5);
  });

  it("scales a millimetre model and fills quantity, unit and storey from the standard IFC data", () => {
    expect(by("S1")).toMatchObject({ quantity: 18, unit: "m3", building_level: "Level 1", ifc_class: "IFCSLAB" });
    expect(by("S1").raw_properties._quantities).toEqual({ m3: 18, m2: 90 });
    expect(by("S1").raw_properties._level_source).toBe("containment");
    expect(by("S1").raw_properties._quantity_basis).toBe("IfcElementQuantity NetVolume");
  });

  it("takes a storey from the spatial tree when the element has no containment relation", () => {
    expect(by("C1")).toMatchObject({ quantity: 0.9, unit: "m3", building_level: "Level 2" });
    expect(by("C1").raw_properties._level_source).toBe("spatial-tree");
  });

  it("derives rebar weight and keeps an element with nothing to measure as a visible gap", () => {
    expect(by("R1")).toMatchObject({ unit: "kg", building_level: "Level 1" });
    expect(by("R1").quantity).toBeCloseTo(9.47, 2);
    expect(by("B1").quantity ?? null).toBeNull();
    expect(by("B1").building_level).toBeUndefined();
  });

  it("lets the project's own parameters win over the IFC quantities", () => {
    expect(by("S2")).toMatchObject({ quantity: 12.5, building_level: "L02" });
  });

  it("reports coverage in words, including when the length unit had to be assumed", () => {
    expect(stats.withQuantity).toBe(4);
    expect(stats.withStorey).toBe(4);
    expect(stats.quantityFromIfc).toBe(3);
    expect(describeExtraction(stats)).toBe("5 elements · 80% with a quantity · 80% with a storey · 3 non-element records skipped");
    const assumed = extractTakeoffRows([{ _category: v("IFCSLAB"), _guid: v("X") }]);
    expect(describeExtraction(assumed.stats)).toContain("metres assumed");
  });
});
