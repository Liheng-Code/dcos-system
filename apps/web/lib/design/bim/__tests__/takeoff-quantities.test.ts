import { describe, expect, it } from "vitest";
import {
  collectQuantities, detectUnitScales, elementQuantity, elementStorey, isPhysicalElement, rebarWeightFromGeometry, type UnitScales,
} from "../takeoff-quantities";

const v = (value: unknown) => ({ value });
const M: UnitScales = { length: 1, assumed: false, basis: "test" };
const MM: UnitScales = { length: 0.001, assumed: false, basis: "test" };

/** An element as FragmentsModel.getItemsData returns it with relations: IsDefinedBy holds nested Pset / Qto items. */
function slab(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _category: v("IFCSLAB"), _localId: v(101), _guid: v("2xk9"), Name: v("Floor:Slab 200:123"),
    IsDefinedBy: [
      { Name: v("Pset_SlabCommon"), HasProperties: [{ Name: v("LoadBearing"), NominalValue: v(true) }] },
      { Name: v("Qto_SlabBaseQuantities"), Quantities: [
        { Name: v("Width"), LengthValue: v(0.2) },
        { Name: v("GrossArea"), AreaValue: v(95) },
        { Name: v("NetArea"), AreaValue: v(90) },
        { Name: v("GrossVolume"), VolumeValue: v(19) },
        { Name: v("NetVolume"), VolumeValue: v(18) },
      ] },
    ],
    ...over,
  };
}

describe("isPhysicalElement", () => {
  it("keeps building elements and drops relationships, property sets, types, spatial containers", () => {
    for (const c of ["IFCSLAB", "IFCBEAM", "IFCCOLUMN", "IFCWALLSTANDARDCASE", "IFCREINFORCINGBAR", "IFCDOOR", "IFCPIPESEGMENT"]) expect(isPhysicalElement(c)).toBe(true);
    for (const c of ["IFCPROPERTYSET", "IFCRELDEFINESBYPROPERTIES", "IFCRELCONTAINEDINSPATIALSTRUCTURE", "IFCSLABTYPE", "IFCCOLUMNTYPE", "IFCGROUP",
      "IFCBUILDINGSTOREY", "IFCSITE", "IFCPROJECT", "IFCSPACE", "IFCELEMENTQUANTITY", "IFCOPENINGELEMENT", "", "UNKNOWN"]) expect(isPhysicalElement(c)).toBe(false);
  });
});

describe("detectUnitScales", () => {
  it("reads the project length unit", () => {
    expect(detectUnitScales([{ _category: v("IFCSIUNIT"), UnitType: v(".LENGTHUNIT."), Prefix: v(".MILLI.") }]).length).toBe(0.001);
    expect(detectUnitScales([{ _category: v("IFCSIUNIT"), UnitType: v("LENGTHUNIT") }]).length).toBe(1);
    expect(detectUnitScales([{ _category: v("IFCCONVERSIONBASEDUNIT"), UnitType: v("LENGTHUNIT"), Name: v("FOOT") }]).length).toBe(0.3048);
  });
  it("ignores area / volume units and says when it had to assume metres", () => {
    const s = detectUnitScales([{ _category: v("IFCSIUNIT"), UnitType: v("AREAUNIT") }, { _category: v("IFCSLAB") }]);
    expect(s.length).toBe(1);
    expect(s.assumed).toBe(true);
  });
});

describe("elementQuantity", () => {
  it("takes NetVolume as the slab quantity and keeps the net area next to it", () => {
    const q = elementQuantity(slab(), M)!;
    expect(q.quantity).toBe(18);
    expect(q.unit).toBe("m3");
    expect(q.basis).toBe("IfcElementQuantity NetVolume");
    expect(q.extra).toEqual({ m2: 90 }); // Width is a thickness, not a length to carry
  });

  it("falls back to gross when net is missing", () => {
    const item = slab({ IsDefinedBy: [{ Name: v("Qto"), Quantities: [{ Name: v("GrossVolume"), VolumeValue: v(19) }] }] });
    expect(elementQuantity(item, M)!.quantity).toBe(19);
  });

  it("scales a millimetre model to cubic metres and square metres", () => {
    const item = slab({ IsDefinedBy: [{ Name: v("Qto"), Quantities: [{ Name: v("NetVolume"), VolumeValue: v(18_000_000_000) }, { Name: v("NetArea"), AreaValue: v(90_000_000) }] }] });
    const q = elementQuantity(item, MM)!;
    expect(q.quantity).toBe(18);
    expect(q.extra.m2).toBe(90);
  });

  it("reads a numeric property named like a quantity when there is no quantity set", () => {
    const item = { _category: v("IFCBEAM"), IsDefinedBy: [{ Name: v("Dimensions"), HasProperties: [{ Name: v("Volume"), NominalValue: v(1.25) }, { Name: v("Length"), NominalValue: v(5) }, { Name: v("Mark"), NominalValue: v("B1") }] }] };
    const q = elementQuantity(item, M)!;
    expect(q.quantity).toBe(1.25);
    expect(q.basis).toBe("property Volume");
    expect(q.extra.m).toBe(5);
  });

  it("measures a wall volume with its side area, and a rebar in kilograms", () => {
    const wall = { _category: v("IFCWALLSTANDARDCASE"), IsDefinedBy: [{ Name: v("Qto"), Quantities: [{ Name: v("NetVolume"), VolumeValue: v(7.2) }, { Name: v("NetSideArea"), AreaValue: v(24) }, { Name: v("NetFootprintArea"), AreaValue: v(2.4) }] }] };
    const w = elementQuantity(wall, M)!;
    expect(w).toMatchObject({ quantity: 7.2, unit: "m3" });
    expect(w.extra.m2).toBe(24); // side face, not footprint
    const bar = { _category: v("IFCREINFORCINGBAR"), IsDefinedBy: [{ Name: v("Qto"), Quantities: [{ Name: v("Weight"), WeightValue: v(14.8) }] }] };
    expect(elementQuantity(bar, M)).toMatchObject({ quantity: 14.8, unit: "kg" });
  });

  it("derives rebar weight from the bar's geometry when none is stored", () => {
    // 16 mm bar, 6 m long: pi/4 * 0.016^2 * 6 * 7850 = 9.47 kg
    const bar = { _category: v("IFCREINFORCINGBAR"), NominalDiameter: v(16), BarLength: v(6000) };
    expect(rebarWeightFromGeometry(bar, MM)).toBeCloseTo(9.47, 2);
    const q = elementQuantity(bar, MM)!;
    expect(q.unit).toBe("kg");
    expect(q.basis).toContain("derived");
    // with a stored section area it uses that instead
    expect(rebarWeightFromGeometry({ BarLength: v(6000), CrossSectionArea: v(201.06) }, MM)).toBeCloseTo(9.47, 2);
    expect(rebarWeightFromGeometry({ NominalDiameter: v(16) }, MM)).toBeNull();
  });

  it("returns null rather than a guess when the element has no quantity at all", () => {
    expect(elementQuantity({ _category: v("IFCSLAB"), Name: v("x") }, M)).toBeNull();
    expect(elementQuantity(slab({ IsDefinedBy: [{ Name: v("Qto"), Quantities: [{ Name: v("NetVolume"), VolumeValue: v(0) }] }] }), M)).toBeNull();
  });

  it("collects both typed quantities and named properties", () => {
    const names = collectQuantities(slab()).map((q) => q.name);
    expect(names).toEqual(expect.arrayContaining(["Width", "GrossArea", "NetArea", "GrossVolume", "NetVolume"]));
  });
});

describe("elementStorey", () => {
  it("prefers the containment relation, then the spatial tree, then geometry", () => {
    const withRel = { _localId: v(1), ContainedInStructure: [{ Name: v("Level 3") }] };
    expect(elementStorey(withRel, { spatial: new Map([[1, "Tree level"]]) })).toEqual({ name: "Level 3", source: "containment" });
    expect(elementStorey({ _localId: v(2) }, { spatial: new Map([[2, "Level 2"]]), geometric: new Map([[2, "Geo"]]) })).toEqual({ name: "Level 2", source: "spatial-tree" });
    expect(elementStorey({ _localId: v(3) }, { geometric: new Map([[3, "Level 1"]]) })).toEqual({ name: "Level 1", source: "geometry" });
    expect(elementStorey({ _localId: v(4) }, {})).toBeNull();
  });
});
