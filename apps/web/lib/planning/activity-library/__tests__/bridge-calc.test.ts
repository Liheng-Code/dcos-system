import { describe, expect, it } from "vitest";
import { buildPreview, computeBridgeLinks, pairKey, previewDays, type MasterRate } from "../bridge-calc";
import type { SavedLocation, WbsLevel } from "../location-map";
import type { BridgeBoqLine, BridgeRule } from "../qs-bridge";

const rule = (p: Partial<BridgeRule> & Pick<BridgeRule, "id">): BridgeRule => ({
  role: "driver", metric_code: null, metric_unit: null, unit_factor: 1, match_discipline: null, match_section: null,
  match_sub_section: null, match_sub_element: null, match_unit: null, note: null, is_active: true, sort_order: 0, ...p,
});
const rules = [
  rule({ id: "col-rebar", metric_code: "column_rebar", metric_unit: "t", unit_factor: 0.001, match_sub_section: "Structural Column", match_sub_element: "Rebar", match_unit: "kg" }),
  rule({ id: "col-form", metric_code: "column_formwork", metric_unit: "m²", match_sub_section: "Structural Column", match_sub_element: "Formwork" }),
  rule({ id: "tie", role: "excluded", match_sub_element: "Steel Tie Wire" }),
];

const levels: WbsLevel[] = [
  { id: "GF", wbs_code: "01.GF", wbs_name: "Ground Floor", building_code: "BA" },
  { id: "L01", wbs_code: "03.1F", wbs_name: "1F Floor", building_code: "BA" },
];
const saved: SavedLocation[] = [
  { building_code: "BA", qs_level_label: "02.GF", wbs_node_id: "GF", status: "confirmed", split_rule: "none" },
  { building_code: "BA", qs_level_label: "All", wbs_node_id: null, status: "confirmed", split_rule: "gfa" },
];

let n = 0;
const line = (sub_element: string, unit: string, quantity: number, level: string): BridgeBoqLine => ({
  id: `b${++n}`, item_code: `C-${n}`, description: `Column ${sub_element}`, discipline: "Civil and Structure", section: "Super Structure",
  sub_section: "Structural Column", sub_element, unit, quantity, level, building_code: "BA",
});

// PJR-2026-003 ground floor column lines
const gf = [
  line("Rebar", "kg", 10516.48, "02.GF"),
  line("Rebar", "kg", 1921.92, "02.GF"),
  line("Rebar", "kg", 3061.26, "02.GF"),
  line("Formwork", "m2", 221.76, "02.GF"),
  line("Steel Tie Wire", "kg", 619.99, "02.GF"),
];

describe("computeBridgeLinks", () => {
  it("gives the ground floor 15.50 t of column rebar from three BOQ lines, traceably", () => {
    const r = computeBridgeLinks(gf, rules, saved, levels, new Map(), new Set());
    const rebar = r.quantities.find((q) => q.metric === "column_rebar");
    expect(rebar).toMatchObject({ wbs_node_id: "GF", unit: "t", quantity: 15.49966, lines: 3 });
    expect(r.links.filter((l) => l.metric_code === "column_rebar").map((l) => l.factor)).toEqual([0.001, 0.001, 0.001]);
    expect(r.links.find((l) => l.metric_code === "column_formwork")).toMatchObject({ factor: 1, boq_quantity: 221.76, bridge_rule_id: "col-form" });
    expect(r.links.some((l) => l.boq_description === "Column Steel Tie Wire")).toBe(false);
  });

  it("counts driver lines at unconfirmed locations as unallocated", () => {
    const r = computeBridgeLinks([line("Rebar", "kg", 3061.26, "04.1F")], rules, saved, levels, new Map(), new Set());
    expect(r.links).toHaveLength(0);
    expect(r.unallocatedLines).toBe(1);
    expect(r.unallocatedByLocation.get("BA · 04.1F")).toBe(1);
  });

  it("splits a project-wide line by level GFA", () => {
    const r = computeBridgeLinks([line("Formwork", "m2", 1000, "All")], rules, saved, levels, new Map([["GF", 600], ["L01", 400]]), new Set());
    expect(r.quantities.map((q) => [q.wbs_node_id, q.quantity])).toEqual([["GF", 600], ["L01", 400]]);
  });

  it("never touches a level/metric the planner linked by hand", () => {
    const r = computeBridgeLinks(gf, rules, saved, levels, new Map(), new Set([pairKey("GF", "column_rebar")]));
    expect(r.links.some((l) => l.metric_code === "column_rebar")).toBe(false);
    expect(r.links.some((l) => l.metric_code === "column_formwork")).toBe(true);
    expect(r.skippedManual).toBe(1);
  });
});

describe("duration preview", () => {
  const rate = (p: Partial<MasterRate>): MasterRate => ({
    master_id: "m", master_code: "STR-RC-COL-001", master_name: "Column Reinforcement", metric: "column_rebar", unit: "ton",
    work_group: "ST", duration_basis: "quantity", norm_code: "WB-P05-COL-REBAR", norm_status: "draft", output_per_day: 1, ...p,
  });

  it("matches the doc 21 worked example: 15.50 t at 1 t/day = 16 wd for one crew; formwork 221.76 m² at 40/day = 6 wd", () => {
    expect(previewDays(15.49966, rate({}))).toBe(16);
    expect(previewDays(221.76, rate({ output_per_day: 40 }))).toBe(6);
  });

  it("gives no days without a rate or for fixed / programme activities", () => {
    expect(previewDays(10, rate({ output_per_day: null }))).toBeNull();
    expect(previewDays(10, rate({ duration_basis: "fixed" }))).toBeNull();
  });

  it("builds one row per master measuring a metric with quantity", () => {
    const r = computeBridgeLinks(gf, rules, saved, levels, new Map(), new Set());
    const rows = buildPreview(r.quantities, [rate({}), rate({ master_code: "STR-RC-BEAM-001", metric: "beam_rebar" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].cells.get("GF")).toMatchObject({ quantity: 15.49966, days: 16, lines: 3 });
  });
});
