import { describe, expect, it } from "vitest";
import { aggregateBim, bimLevelKey, canonicalLevel, coverageByClass, suggestLevelMap, type BimElementRow } from "../bim-quantity";

const el = (over: Partial<BimElementRow> = {}): BimElementRow => ({
  ifc_class: "IFCSLAB", unit: "m3", quantity: 10, level: "Level 1", building_level: null, ...over,
});

describe("coverageByClass", () => {
  it("reports the real state of an extract with no quantities or storeys", () => {
    const rows = Array.from({ length: 5 }, () => el({ quantity: null, unit: null, level: null }));
    const c = coverageByClass(rows)[0];
    expect(c).toMatchObject({ ifc_class: "IFCSLAB", total: 5, withQuantity: 0, withLevel: 0, usable: 0, ready: false });
  });

  it("is ready at 80% usable and lists the units seen", () => {
    const rows = [...Array.from({ length: 8 }, () => el()), el({ quantity: null }), el({ level: null })];
    const c = coverageByClass(rows)[0];
    expect(c.usable).toBe(8);
    expect(c.usableShare).toBe(0.8);
    expect(c.ready).toBe(true);
    expect(c.units).toEqual(["m3"]);
  });

  it("is not ready just below the threshold", () => {
    const rows = [...Array.from({ length: 7 }, () => el()), ...Array.from({ length: 3 }, () => el({ quantity: 0 }))];
    expect(coverageByClass(rows)[0].ready).toBe(false);
  });

  it("separates classes and sorts the largest first", () => {
    const rows = [el(), el({ ifc_class: "IFCBEAM" }), el({ ifc_class: "IFCBEAM" })];
    expect(coverageByClass(rows).map((c) => c.ifc_class)).toEqual(["IFCBEAM", "IFCSLAB"]);
  });
});

describe("aggregateBim", () => {
  const rules = [{ metric_code: "slab_volume", ifc_class: "IFCSLAB", unit: "m3" }];

  it("sums only usable elements of the mapped class and unit on the chosen storeys", () => {
    const rows = [
      el({ quantity: 90.5 }), el({ quantity: 89.5 }),
      el({ level: "Level 2", quantity: 500 }),          // another storey
      el({ ifc_class: "IFCBEAM", quantity: 70 }),         // another class
      el({ unit: "m2", quantity: 800 }),                  // another unit
      el({ quantity: null }),                             // no quantity
    ];
    const a = aggregateBim(rows, rules, new Set(["Level 1"]))!;
    expect(a.value).toBe(180);
    expect(a.elements).toBe(2);
    expect(a.unit).toBe("m3");
  });

  it("treats m³ and m3 alike and uses building_level before level", () => {
    const rows = [el({ unit: "m³", level: "x", building_level: "Level 1", quantity: 5 })];
    expect(aggregateBim(rows, rules, new Set(["Level 1"]))!.value).toBe(5);
    expect(bimLevelKey(rows[0])).toBe("Level 1");
  });

  it("returns null when nothing usable is found", () => {
    expect(aggregateBim([el({ quantity: null })], rules, new Set(["Level 1"]))).toBeNull();
    expect(aggregateBim([el()], rules, new Set())).toBeNull();
    expect(aggregateBim([el()], [], new Set(["Level 1"]))).toBeNull();
  });
});

describe("level suggestions", () => {
  it("normalises common storey labels", () => {
    expect(canonicalLevel("Level 3")).toBe("3F");
    expect(canonicalLevel("L03")).toBe("3F");
    expect(canonicalLevel("3rd Floor")).toBe("3F");
    expect(canonicalLevel("Ground Floor")).toBe("GF");
    expect(canonicalLevel("Roof")).toBe("RF");
    expect(canonicalLevel("Site plan")).toBeNull();
  });

  it("matches BIM storeys to WBS levels by canonical name and leaves the rest open", () => {
    const nodes = [{ id: "n1", name: "1F Floor" }, { id: "n2", name: "2F Floor" }, { id: "g", name: "Ground Floor" }];
    const s = suggestLevelMap(["Level 1", "L02", "Ground Floor", "Podium"], nodes);
    expect(s.map((x) => x.nodeId)).toEqual(["n1", "n2", "g", null]);
    expect(s[3].basis).toBeNull();
  });
});

import { quantityIn } from "../bim-quantity";

describe("secondary quantities stored by the extractor", () => {
  const slab = (over: Partial<BimElementRow> = {}): BimElementRow => ({ ifc_class: "IFCSLAB", unit: "m3", quantity: 18, level: null, building_level: "Level 1", extra: { m3: 18, m2: 90 }, ...over });

  it("an element answers in its own unit and in the secondary one", () => {
    expect(quantityIn(slab(), "m3")).toBe(18);
    expect(quantityIn(slab(), "m²")).toBe(90);
    expect(quantityIn(slab(), "kg")).toBeNull();
    expect(quantityIn(slab({ quantity: null, unit: null, extra: { m2: 90 } }), "m2")).toBe(90);
  });

  it("slab area and slab volume both come from the same element", () => {
    const rows = [slab(), slab({ quantity: 12, extra: { m3: 12, m2: 60 } })];
    const storeys = new Set(["Level 1"]);
    expect(aggregateBim(rows, [{ metric_code: "slab_volume", ifc_class: "IFCSLAB", unit: "m3" }], storeys)).toMatchObject({ value: 30, unit: "m3", elements: 2 });
    expect(aggregateBim(rows, [{ metric_code: "slab_area", ifc_class: "IFCSLAB", unit: "m2" }], storeys)).toMatchObject({ value: 150, unit: "m2", elements: 2 });
  });

  it("coverage counts an element that only has a secondary quantity", () => {
    const c = coverageByClass([slab({ quantity: null, unit: null, extra: { m2: 90 } }), slab()])[0];
    expect(c.usable).toBe(2);
    expect(c.units).toEqual(["m2", "m3"]);
  });
});
