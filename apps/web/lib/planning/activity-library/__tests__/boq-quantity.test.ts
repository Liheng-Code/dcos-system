import { describe, expect, it } from "vitest";
import { aggregateBoqLinks, evenShare, levelRangeHint, unitsCompatible, type BoqLinkRow } from "../boq-quantity";

const link = (id: string, ref: string, factor: number, atLink = 500, unit = "m3"): BoqLinkRow => ({
  id, boq_source: "qs_boq", boq_item_id: `item-${id}`, boq_item_ref: ref, boq_unit: unit, boq_quantity_at_link: atLink, factor,
});

describe("aggregateBoqLinks", () => {
  it("returns null without links", () => expect(aggregateBoqLinks([], new Map())).toBeNull());

  it("sums live quantity x factor and names every line", () => {
    const links = [link("1", "STR-001", 0.1), link("2", "STR-009", 1, 20)];
    const live = new Map([["qs_boq:item-1", { quantity: 500, unit: "m3" }], ["qs_boq:item-2", { quantity: 20, unit: "m3" }]]);
    const a = aggregateBoqLinks(links, live)!;
    expect(a.value).toBe(70); // 500 x 0.1 + 20
    expect(a.ref).toBe("BOQ STR-001 x0.1 + BOQ STR-009");
    expect(a.unit).toBe("m3");
    expect(a.drifted).toEqual([]);
  });

  it("follows a BOQ revision and flags the drift", () => {
    const links = [link("1", "STR-001", 0.1)];
    const a = aggregateBoqLinks(links, new Map([["qs_boq:item-1", { quantity: 600, unit: "m3" }]]))!;
    expect(a.value).toBe(60);
    expect(a.drifted).toEqual(["STR-001"]);
  });

  it("falls back to the quantity seen at link time when the line cannot be read", () => {
    expect(aggregateBoqLinks([link("1", "A", 0.5, 400)], new Map())!.value).toBe(200);
  });

  it("flags mixed units", () => {
    const links = [link("1", "A", 1, 10, "m3"), link("2", "B", 1, 10, "m2")];
    expect(aggregateBoqLinks(links, new Map())!.unitConflict).toBe(true);
  });
});

describe("helpers", () => {
  it("spreads a lump evenly", () => {
    expect(evenShare(10)).toBe(0.1);
    expect(evenShare(3)).toBe(0.333333333);
    expect(Math.round(540 * evenShare(3) * 1000) / 1000).toBe(180);
    expect(evenShare(0)).toBe(1);
  });

  it("reads level ranges in BOQ descriptions", () => {
    expect(levelRangeHint("Concrete C25/30 to slabs, L1-L10")).toBe(10);
    expect(levelRangeHint("Slab 1F-9F")).toBe(9);
    expect(levelRangeHint("Level 2 to 5 slabs")).toBe(4);
    expect(levelRangeHint("Normal Concrete, 35Mpa (Cylinder), Slump 15+-2.5")).toBeNull();
  });

  it("treats m3 and m³ as the same unit", () => {
    expect(unitsCompatible("m3", "m³")).toBe(true);
    expect(unitsCompatible("m2", "m³")).toBe(false);
    expect(unitsCompatible(null, "m³")).toBe(true);
  });
});

import { floorNumber, levelRangeBounds, singularise } from "../boq-quantity";

describe("ranking helpers", () => {
  it("reads range bounds and floor numbers", () => {
    expect(levelRangeBounds("Concrete C25/30 to slabs, L1-L10")).toEqual([1, 10]);
    expect(levelRangeBounds("Slab 2F-5F")).toEqual([2, 5]);
    expect(levelRangeBounds("Lean concrete")).toBeNull();
    expect(floorNumber("3F Floor")).toBe(3);
    expect(floorNumber("Level 12")).toBe(12);
    expect(floorNumber("Ground Floor")).toBeNull();
  });

  it("singularises plurals for scoring only", () => {
    expect(singularise("Concrete to slabs and beams")).toBe("Concrete to slab and beam");
  });
});
