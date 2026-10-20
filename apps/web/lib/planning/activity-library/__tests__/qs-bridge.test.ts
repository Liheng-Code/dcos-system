import { describe, expect, it } from "vitest";
import { bridgeCoverage, classifyLine, type BridgeBoqLine, type BridgeRule } from "../qs-bridge";

let n = 0;
const rule = (p: Partial<BridgeRule>): BridgeRule => ({
  id: `r${++n}`,
  role: "driver",
  metric_code: null,
  metric_unit: null,
  unit_factor: 1,
  match_discipline: null,
  match_section: null,
  match_sub_section: null,
  match_sub_element: null,
  match_unit: null,
  note: null,
  is_active: true,
  sort_order: n,
  ...p,
});

const CS = "Civil and Structure";
const rules: BridgeRule[] = [
  rule({ metric_code: "column_rebar", metric_unit: "t", unit_factor: 0.001, match_discipline: CS, match_sub_section: "Structural Column", match_sub_element: "Rebar", match_unit: "kg" }),
  rule({ metric_code: "column_formwork", metric_unit: "m²", match_discipline: CS, match_sub_section: "Structural Column", match_sub_element: "Formwork", match_unit: "m2" }),
  rule({ metric_code: "slab_rebar_bottom", metric_unit: "t", unit_factor: 0.0005, match_discipline: CS, match_sub_section: "Structural Slab", match_sub_element: "Rebar", match_unit: "kg" }),
  rule({ metric_code: "slab_rebar_top", metric_unit: "t", unit_factor: 0.0005, match_discipline: CS, match_sub_section: "Structural Slab", match_sub_element: "Rebar", match_unit: "kg" }),
  rule({ role: "excluded", match_sub_element: "Steel Tie Wire", note: "Material within rebar fixing" }),
  rule({ metric_code: "wall_plaster_area", metric_unit: "m²", match_discipline: "Architecture", match_section: "Internal Wall Finishes", match_sub_section: "Plastering", match_unit: "m2" }),
  rule({ metric_code: "ext_plaster_area", metric_unit: "m²", match_discipline: "Architecture", match_section: "Exterior Wall Finishes", match_sub_section: "Plastering", match_unit: "m2" }),
  rule({ metric_code: "old_metric", metric_unit: "m²", match_sub_section: "Painting", is_active: false }),
];

const line = (p: Partial<BridgeBoqLine>): BridgeBoqLine => ({
  id: `l${++n}`, discipline: CS, section: "Super Structure", sub_section: null, sub_element: null, unit: null, quantity: 0, ...p,
});

describe("classifyLine", () => {
  it("converts column rebar kg to tonnes (PJR-2026-003 GF line)", () => {
    const c = classifyLine(line({ sub_section: "Structural Column", sub_element: "Rebar", unit: "kg", quantity: 10516.48 }), rules);
    expect(c).toEqual({ status: "driver", contributions: [{ ruleId: rules[0].id, metric: "column_rebar", unit: "t", quantity: 10.51648 }] });
  });

  it("is case- and space-insensitive", () => {
    const c = classifyLine(line({ sub_section: " structural  column ", sub_element: "FORMWORK", unit: "M2", quantity: 221.76 }), rules);
    expect(c.status).toBe("driver");
  });

  it("lets one line feed two metrics (slab rebar bottom / top)", () => {
    const c = classifyLine(line({ sub_section: "Structural Slab", sub_element: "Rebar", unit: "kg", quantity: 10000 }), rules);
    expect(c.status === "driver" && c.contributions.map((k) => [k.metric, k.quantity])).toEqual([["slab_rebar_bottom", 5], ["slab_rebar_top", 5]]);
  });

  it("excludes non-driving material lines", () => {
    expect(classifyLine(line({ sub_section: "Structural Column", sub_element: "Steel Tie Wire", unit: "kg", quantity: 619.99 }), rules).status).toBe("excluded");
  });

  it("uses Section to separate internal from external plaster", () => {
    const int = classifyLine(line({ discipline: "Architecture", section: "Internal Wall Finishes", sub_section: "Plastering", sub_element: "Plastering", unit: "m2", quantity: 1 }), rules);
    const ext = classifyLine(line({ discipline: "Architecture", section: "Exterior Wall Finishes", sub_section: "Plastering", sub_element: "Plastering", unit: "m2", quantity: 1 }), rules);
    expect(int.status === "driver" && int.contributions[0].metric).toBe("wall_plaster_area");
    expect(ext.status === "driver" && ext.contributions[0].metric).toBe("ext_plaster_area");
  });

  it("reports a unit change instead of converting it", () => {
    const c = classifyLine(line({ sub_section: "Structural Column", sub_element: "Rebar", unit: "t", quantity: 10 }), rules);
    expect(c).toMatchObject({ status: "unit_mismatch", expectedUnit: "kg" });
  });

  it("ignores inactive rules and leaves unknown lines unmapped", () => {
    expect(classifyLine(line({ discipline: "Architecture", sub_section: "Painting", unit: "m2", quantity: 1 }), rules).status).toBe("unmapped");
  });
});

describe("bridgeCoverage", () => {
  it("totals metrics, counts classes and groups unmapped lines", () => {
    const lines = [
      line({ sub_section: "Structural Column", sub_element: "Rebar", unit: "kg", quantity: 10516.48 }),
      line({ sub_section: "Structural Column", sub_element: "Rebar", unit: "kg", quantity: 1921.92 }),
      line({ sub_section: "Structural Column", sub_element: "Rebar", unit: "kg", quantity: 3061.26 }),
      line({ sub_section: "Structural Column", sub_element: "Steel Tie Wire", unit: "kg", quantity: 619.99 }),
      line({ sub_section: "Structural Steel", sub_element: "U steel", unit: "m", quantity: 775.9 }),
      line({ sub_section: "Structural Steel", sub_element: "U steel", unit: "m", quantity: 10 }),
    ];
    const cov = bridgeCoverage(lines, rules, new Map([["column_rebar", ["STR-RC-COL-001"]]]));
    expect(cov).toMatchObject({ totalLines: 6, driverLines: 3, excludedLines: 1, unmappedLines: 2, mismatchLines: 0 });
    expect(cov.metrics).toEqual([{ metric: "column_rebar", unit: "t", quantity: 15.49966, lines: 3, masters: ["STR-RC-COL-001"] }]);
    expect(cov.unmapped).toHaveLength(1);
    expect(cov.unmapped[0]).toMatchObject({ sub_element: "U steel", lines: 2, quantity: 785.9 });
  });
});
