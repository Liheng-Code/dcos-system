import { describe, expect, it } from "vitest";
import { reconcile, reconcileLine, type MappingFact } from "../reconcile";

const fact = (p: Partial<MappingFact>): MappingFact => ({
  source: "qs_boq", id: "L1", in_scope: true, ref: "STR-001", description: "Formwork", unit: "m2", quantity: 100,
  building: "BA", level: "L01", work_item_id: null, work_item_share_pct: null, work_item_masters: null,
  programme: null, links: null, direct: null, ...p,
});

describe("reconcileLine", () => {
  it("unmapped line", () => {
    const r = reconcileLine(fact({}));
    expect(r.status).toBe("unmapped");
    expect(r.paths).toBe(0);
    expect(r.issues).toEqual([]);
  });

  it("programme split over two floors is complete", () => {
    const r = reconcileLine(fact({ programme: { share_pct: 100, quantity: 100, tasks: 2 } }));
    expect(r.status).toBe("complete");
    expect(r.mapped_quantity).toBe(100);
    expect(r.issues).toEqual([]);
  });

  it("a line taken in full by several activities is counted twice", () => {
    const r = reconcileLine(fact({ programme: { share_pct: 700, quantity: 700, tasks: 7 }, work_item_share_pct: 700, work_item_masters: 7 }));
    expect(r.status).toBe("over");
    expect(r.issues).toEqual(expect.arrayContaining(["counted_twice", "library_shares"]));
    expect(r.mapped_pct).toBe(700);
  });

  it("partial mapping", () => {
    const r = reconcileLine(fact({ programme: { share_pct: 88.9, quantity: 88.9, tasks: 2 } }));
    expect(r.status).toBe("partial");
  });

  it("links in the same unit add up by factor; plural/alias units compare equal", () => {
    const r = reconcileLine(fact({ unit: "sqm", links: [{ metric_code: "fw", unit: "m2", factor_sum: 1, nodes: 3, stale: 0 }] }));
    expect(r.status).toBe("complete");
    expect(r.mapped_quantity).toBe(100);
  });

  it("links in another unit cannot be checked", () => {
    const r = reconcileLine(fact({ unit: "kg", links: [{ metric_code: "rebar_t", unit: "t", factor_sum: 0.001, nodes: 1, stale: 0 }] }));
    expect(r.status).toBe("converted");
    expect(r.issues).toContain("unit_conversion");
  });

  it("programme plus a direct task link is two paths and over-mapped", () => {
    const r = reconcileLine(fact({ programme: { share_pct: 100, quantity: 100, tasks: 1 }, direct: { quantity: 100, tasks: 1, unit: "m2" } }));
    expect(r.status).toBe("over");
    expect(r.issues).toEqual(expect.arrayContaining(["counted_twice", "multiple_paths"]));
  });

  it("stale programme and links", () => {
    const r = reconcileLine(fact({
      quantity: 120,
      programme: { share_pct: 50, quantity: 50, tasks: 1 },
      links: [{ metric_code: "fw", unit: "m2", factor_sum: 0.5, nodes: 1, stale: 1 }],
    }));
    expect(r.issues).toEqual(expect.arrayContaining(["stale_programme", "stale_links", "multiple_paths"]));
    expect(r.status).toBe("complete");
  });

  it("mapped line outside the programme BOQ and zero quantity", () => {
    const r = reconcileLine(fact({ in_scope: false, quantity: 0, direct: { quantity: 0, tasks: 1, unit: "m2" } }));
    expect(r.issues).toEqual(expect.arrayContaining(["other_boq", "zero_quantity"]));
  });
});

describe("reconcile", () => {
  it("counts statuses and totals in-scope lines per unit", () => {
    const { summary } = reconcile([
      fact({ id: "a", programme: { share_pct: 100, quantity: 100, tasks: 1 } }),
      fact({ id: "b", unit: "M2", quantity: 50 }),
      fact({ id: "c", unit: "m3", quantity: 10, programme: { share_pct: 200, quantity: 20, tasks: 2 } }),
      fact({ id: "d", in_scope: false, programme: { share_pct: 100, quantity: 100, tasks: 1 } }),
    ]);
    expect(summary.byStatus).toEqual({ unmapped: 1, partial: 0, complete: 2, over: 1, converted: 0 });
    expect(summary.byIssue.counted_twice).toBe(1);
    expect(summary.byIssue.other_boq).toBe(1);
    expect(summary.totals).toEqual([
      { unit: "m2", boq_quantity: 150, mapped_quantity: 100, lines: 2 },
      { unit: "m3", boq_quantity: 10, mapped_quantity: 20, lines: 1 },
    ]);
  });
});

describe("review fixes", () => {
  it("rounding over many programme tasks is not a BOQ change", () => {
    // 150 tasks each rounded to 4 dp: up to 0.0075 apart from the exact share
    const r = reconcileLine(fact({ quantity: 10, programme: { share_pct: 100, quantity: 10.006, tasks: 150 } }));
    expect(r.issues).not.toContain("stale_programme");
  });

  it("a direct task in another unit is not compared", () => {
    const r = reconcileLine(fact({ unit: "m3", direct: { quantity: 5000, tasks: 1, unit: "kg" } }));
    expect(r.status).toBe("converted");
    expect(r.mapped_quantity).toBe(0);
    expect(r.issues).toContain("unit_conversion");
  });
});
