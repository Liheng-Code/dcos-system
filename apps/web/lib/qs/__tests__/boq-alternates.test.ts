import { describe, expect, it } from "vitest";
import {
  alternateAmount,
  alternateDelta,
  groupAlternatesByItem,
  nextAltNo,
  summarizeAlternates,
  type TenderBoqItemAlternate,
} from "../boq-alternates";

function alt(boqItemId: string, altNo: number, unitRate: number): TenderBoqItemAlternate {
  return {
    id: `${boqItemId}-${altNo}`,
    tender_id: "t1",
    boq_item_id: boqItemId,
    alt_no: altNo,
    description: "alt",
    notes: null,
    labor_net_cost: 0,
    labor_margin_pct: 0,
    material_net_cost: 0,
    material_margin_pct: 0,
    unit_rate: unitRate,
    is_manual_rate: false,
    rate_source: "manual",
    dwl_work_item_id: null,
    dwl_assembly_id: null,
    price_list_item_id: null,
    source_cost_db_item_id: null,
    rate_build_up: null,
    brand: null,
    supplier: null,
    material_type: null,
    created_by: null,
    created_at: "2026-10-22T00:00:00Z",
    updated_at: "2026-10-22T00:00:00Z",
  };
}

const items = [
  { id: "A", quantity: 100, total_amount: 5000 },
  { id: "B", quantity: 40, total_amount: 4800 },
];
const alts = [alt("B", 1, 135), alt("B", 2, 110)];

describe("alternateAmount / alternateDelta", () => {
  it("multiplies quantity by rate", () => {
    expect(alternateAmount(40, 135)).toBe(5400);
  });
  it("rounds to 2 dp (qty 3 x 0.335)", () => {
    expect(alternateAmount(3, 0.335)).toBe(1.01);
  });
  it("is positive for Add and negative for Omit", () => {
    expect(alternateDelta(40, 135, 4800)).toBe(600);
    expect(alternateDelta(40, 110, 4800)).toBe(-400);
  });
});

describe("summarizeAlternates", () => {
  it("worked example: groups by alt_no with value and delta", () => {
    expect(summarizeAlternates(items, alts)).toEqual([
      { altNo: 1, lines: 1, value: 5400, delta: 600 },
      { altNo: 2, lines: 1, value: 4400, delta: -400 },
    ]);
  });
  it("excludes alternates whose item is not in the (filtered) list", () => {
    expect(summarizeAlternates([items[0]], alts)).toEqual([]);
    expect(summarizeAlternates(items, [...alts, alt("Z", 1, 50)])).toHaveLength(2);
  });
  it("sums multiple lines under the same alt_no, ascending", () => {
    const more = [alt("A", 2, 60), alt("B", 2, 110), alt("A", 1, 40)];
    expect(summarizeAlternates(items, more)).toEqual([
      { altNo: 1, lines: 1, value: 4000, delta: -1000 },
      { altNo: 2, lines: 2, value: 10400, delta: 600 },
    ]);
  });
  it("treats null base total as 0", () => {
    expect(summarizeAlternates([{ id: "A", quantity: 2, total_amount: null }], [alt("A", 1, 10)])).toEqual([
      { altNo: 1, lines: 1, value: 20, delta: 20 },
    ]);
  });
  it("returns empty for no alternates", () => {
    expect(summarizeAlternates(items, [])).toEqual([]);
  });
});

describe("nextAltNo", () => {
  it("is 1 when the item has none", () => {
    expect(nextAltNo(alts, "A")).toBe(1);
  });
  it("is max + 1 (gaps do not get reused)", () => {
    expect(nextAltNo([alt("B", 1, 1), alt("B", 3, 1)], "B")).toBe(4);
  });
});

describe("groupAlternatesByItem", () => {
  it("groups per item sorted by alt_no", () => {
    const m = groupAlternatesByItem([alt("B", 2, 1), alt("A", 1, 1), alt("B", 1, 1)]);
    expect(m.get("B")?.map((a) => a.alt_no)).toEqual([1, 2]);
    expect(m.get("A")).toHaveLength(1);
    expect(m.get("C")).toBeUndefined();
  });
});
