import { describe, expect, it } from "vitest";
import { add, dec, div, mul, round, sub, toFixedString } from "../decimal";
import { convert } from "../units";
import { evaluate, referencedNames } from "../expression";
import { ENGINE_VERSION, calculate, toRunPayload, type CalculationRequest } from "../calc-engine";
import { areaInSquareMetres, calibrate, lengthInMetres, polygonArea, polylineLength } from "../geometry";
import { compareItems, type ComparableItem } from "../compare";
import { validateVersion } from "../validation";
import { buildExportRows, toCsv } from "../export";
import { canTransitionVersion, isEditable } from "../workflow";
import type { QtoSnapshot, TakeoffItem } from "../types";

const final3 = { stage: "final", dp: 3, mode: "half_up" } as const;
const req = (r: Partial<CalculationRequest>): CalculationRequest => ({
  inputs: [], outputUnit: "m3", rounding: final3, ...r,
});

describe("decimal", () => {
  it("adds without binary floating-point error", () => {
    expect(toFixedString(add(dec("0.1"), dec("0.2")))).toBe("0.3");
    expect(toFixedString(mul(dec(10), mul(dec(8), dec("0.2"))))).toBe("16");
  });
  it("rounds half up, up and down", () => {
    expect(toFixedString(round(dec("2.0005"), 3))).toBe("2.001");
    expect(toFixedString(round(dec("-2.0005"), 3))).toBe("-2.001");
    expect(toFixedString(round(dec("2.0001"), 3, "up"))).toBe("2.001");
    expect(toFixedString(round(dec("2.0009"), 3, "down"))).toBe("2");
  });
  it("rejects division by zero and invalid input", () => {
    expect(() => div(dec(1), dec(0))).toThrow(/Division by zero/);
    expect(() => dec("1e5x")).toThrow();
    expect(() => dec(Number.NaN)).toThrow();
  });
  it("handles exponent-notation numbers", () => {
    expect(toFixedString(dec(1e-7))).toBe("0.0000001");
    expect(toFixedString(sub(dec(1e21), dec(1e21)))).toBe("0");
  });
});

describe("units", () => {
  it("converts within a dimension", () => {
    expect(toFixedString(convert(dec(250), "mm", "m"))).toBe("0.25");
    expect(toFixedString(convert(dec("2.5"), "tonne", "kg"))).toBe("2500");
  });
  it("rejects incompatible units (case 12)", () => {
    expect(() => convert(dec(1), "m2", "m3")).toThrow(/Cannot convert/);
  });
});

describe("expression evaluator", () => {
  const m = (v: number | string) => ({ value: v, unit: "m" });
  it("evaluates an allowlisted formula with units", () => {
    const r = evaluate("L * W * D", { L: m(10), W: m(8), D: { value: 200, unit: "mm" } });
    expect(r.ok && toFixedString(r.value.value)).toBe("16");
    expect(r.ok && r.value.dim).toEqual({ L: 3, M: 0, N: 0 });
  });
  it("supports functions, unary minus and unicode operators", () => {
    const r = evaluate("max(A, B) × 2 − abs(-C)", { A: m(3), B: m(5), C: m(1) });
    expect(r.ok && toFixedString(r.value.value)).toBe("9");
    const rr = evaluate("round(L / 3, 2)", { L: m(10) });
    expect(rr.ok && toFixedString(rr.value.value)).toBe("3.33");
  });
  it.each([
    ["alert(1)", /not allowed/],
    ["constructor.constructor('x')()", /not allowed/],
    ["L; process.exit()", /not allowed/],
    ["L * ", /ends unexpectedly/],
    ["(L * W", /Expected "\)"/],
    ["L / 0", /Division by zero/],
    ["L + W * D", /Cannot add/],
    ["X * 2", /Missing input "X"/],
  ])("rejects %s safely (case 13)", (src, msg) => {
    const r = evaluate(src, { L: m(1), W: m(2), D: m(3) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });
  it("detects circular definitions", () => {
    const r = evaluate("A", { L: m(1) }, { A: "B * 2", B: "A + L" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Circular/);
  });
  it("lists referenced names", () => {
    expect(referencedNames("min(L, W) * D").sort()).toEqual(["D", "L", "W"]);
  });
});

describe("calculation engine", () => {
  const slab = { expression: "L * W * D", inputs: [
    { name: "L", value: 10, unit: "m" }, { name: "W", value: 8, unit: "m" }, { name: "D", value: "0.2", unit: "m" },
  ] };
  it("a 10 × 8 × 0.2 m slab gives 16.00 m3 (case 9)", () => {
    const run = calculate(req(slab));
    expect(run.valid).toBe(true);
    expect(run.result).toBe("16");
    expect(run.engine_version).toBe(ENGINE_VERSION);
  });
  it("a 0.50 m3 deduction gives 15.50 m3 net (case 10)", () => {
    const run = calculate(req({ ...slab, deductions: [{ description: "Pit", value: "0.5", unit: "m3" }] }));
    expect(run.gross).toBe("16");
    expect(run.deductions).toBe("0.5");
    expect(run.net).toBe("15.5");
    expect(run.result).toBe("15.5");
  });
  it("an authorised factor of 1.05 on 100 gives 105 (case 11)", () => {
    const run = calculate(req({
      inputs: [{ name: "A", value: 100, unit: "m2" }], outputUnit: "m2",
      factors: [{ name: "Waste", value: "1.05" }], allowedFactors: [{ name: "Waste", min: 1, max: 1.2 }],
    }));
    expect(run.result).toBe("105");
    expect(run.factor_product).toBe("1.05");
  });
  it("rejects an unauthorised or out-of-range factor", () => {
    const base = { inputs: [{ name: "A", value: 100, unit: "m2" }], outputUnit: "m2", allowedFactors: [{ name: "Waste", min: 1, max: 1.2 }] };
    expect(calculate(req({ ...base, factors: [{ name: "Bonus", value: 2 }] })).errors[0]).toMatch(/not authorised/);
    expect(calculate(req({ ...base, factors: [{ name: "Waste", value: 1.5 }] })).errors[0]).toMatch(/outside/);
  });
  it("rejects a formula whose unit does not match the item (case 12)", () => {
    const run = calculate(req({ ...slab, outputUnit: "m2" }));
    expect(run.valid).toBe(false);
    expect(run.errors[0]).toMatch(/volume/);
  });
  it("rejects deductions in another dimension and deductions over gross", () => {
    expect(calculate(req({ ...slab, deductions: [{ description: "x", value: 1, unit: "m2" }] })).errors[0]).toMatch(/cannot be deducted/);
    expect(calculate(req({ ...slab, deductions: [{ description: "x", value: 17, unit: "m3" }] })).errors[0]).toMatch(/exceed/);
  });
  it("rounds at the configured stage (case 15)", () => {
    const base = { inputs: [{ name: "A", value: "1.2345", unit: "m2" }], outputUnit: "m2", factors: [{ name: "F", value: "1.1" }] };
    const atNet = calculate(req({ ...base, rounding: { stage: "net", dp: 2, mode: "half_up" } }));
    const atFinal = calculate(req({ ...base, rounding: { stage: "final", dp: 2, mode: "half_up" } }));
    expect(atNet.net).toBe("1.23");
    expect(atNet.result).toBe("1.353");
    expect(atFinal.net).toBe("1.2345");
    expect(atFinal.result).toBe("1.36");
  });
  it("keeps gross − deductions = net in the stored payload", () => {
    const run = calculate(req({ inputs: [{ name: "A", value: "1.2345", unit: "m2" }], outputUnit: "m2", rounding: { stage: "net", dp: 2, mode: "half_up" } }));
    const p = toRunPayload(run);
    expect(toFixedString(sub(dec(p.gross), dec(p.deductions)))).toBe(p.net);
  });
  it("is deterministic for identical inputs", () => {
    expect(calculate(req(slab))).toEqual(calculate(req(slab)));
  });
});

describe("geometry", () => {
  // A dimension line 100 page units long is 5 m on the drawing → 0.05 m per unit.
  const cal = calibrate({ x: 0, y: 0 }, { x: 100, y: 0 }, 5000, "mm");
  it("a calibrated line produces the expected length (case 7)", () => {
    expect(lengthInMetres(polylineLength([{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 80 }]), cal)).toBeCloseTo(7, 10);
  });
  it("a calibrated polygon produces the expected area (case 8)", () => {
    const rect = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 160 }, { x: 0, y: 160 }];
    // 200 × 160 units = 10 m × 8 m = 80 m2 (area scales with the square of the scale)
    expect(areaInSquareMetres(polygonArea(rect), cal)).toBeCloseTo(80, 10);
  });
  it("rejects a zero-length calibration", () => {
    expect(() => calibrate({ x: 1, y: 1 }, { x: 1, y: 1 }, 1, "m")).toThrow();
  });
});

describe("revision comparison", () => {
  const item = (o: Partial<ComparableItem>): ComparableItem => ({ id: "x", qto_no: "QTO-1", description: "Slab", unit: "m3", quantity: 0, ...o });
  it("100 → 120 gives +20 and +20% (case 24)", () => {
    const [r] = compareItems([item({ id: "a", quantity: 100 })], [item({ id: "b", quantity: 120, carried_from_item_id: "a" })]);
    expect(r.kind).toBe("increased");
    expect(r.variance).toBe("20");
    expect(r.variancePct).toBe("20.00");
  });
  it("zero to positive has no percentage (case 25)", () => {
    const [r] = compareItems([item({ id: "a", quantity: 0 })], [item({ id: "b", quantity: 5, carried_from_item_id: "a" })]);
    expect(r.kind).toBe("increased");
    expect(r.variancePct).toBeNull();
    const [added] = compareItems([], [item({ id: "n", qto_no: "QTO-9", quantity: 5 })]);
    expect(added.kind).toBe("added");
    expect(added.variancePct).toBeNull();
  });
  it("classifies removed, unchanged, rule and source changes and unresolved matches", () => {
    const rows = compareItems(
      [item({ id: "a", qto_no: "QTO-1", quantity: 10, rule_code: "R1" }), item({ id: "b", qto_no: "QTO-2", quantity: 3 }),
       item({ id: "c", qto_no: "QTO-3", quantity: 4, drawing_revision_id: "r1" }), item({ id: "d", qto_no: "QTO-4", quantity: 1 })],
      [item({ id: "a2", qto_no: "QTO-1", quantity: 10, rule_code: "R2", carried_from_item_id: "a" }),
       item({ id: "c2", qto_no: "QTO-3", quantity: 4, drawing_revision_id: "r2", carried_from_item_id: "c" }),
       item({ id: "d2", qto_no: "QTO-4", quantity: 1, carried_from_item_id: "d" }),
       item({ id: "d3", qto_no: "QTO-5", quantity: 1, carried_from_item_id: "d" })],
    );
    const kinds = Object.fromEntries(rows.map((r) => [r.key, r.kind]));
    expect(kinds).toMatchObject({ "QTO-1": "rule_changed", "QTO-2": "removed", "QTO-3": "source_changed" });
    expect(rows.filter((r) => r.kind === "unresolved")).toHaveLength(2);
  });
});

const baseItem = (o: Partial<TakeoffItem>): TakeoffItem => ({
  id: "i1", tender_id: "t", session_version_id: "v", qto_no: "QTO-000001", item_code: null, description: "Slab",
  unit: "m3", quantity: 16, gross_qty: 16, deduction_qty: 0, factor_product: 1, quantity_status: "FIRM",
  exclusion_reason: null, provisional_assumption: null, building: "BA", level: null, zone: null, discipline: "STR",
  work_section: "Concrete", element: null, wbs_node_id: null, budget_code_id: "bc", rule_code: null, drawing_id: null,
  drawing_revision_id: "r", page_no: 1, grid_location: null, carried_from_item_id: null, carry_status: null,
  remarks: null, is_deleted: false, prepared_by: null, created_at: "", updated_at: "", ...o,
});

describe("validation", () => {
  const version = { id: "v", drawing_revision_id: "r", ruleset_version_id: "rv" };
  it("flags blocking problems and warnings", () => {
    const issues = validateVersion({ version, items: [
      baseItem({ id: "a", quantity_status: "PROVISIONAL" }),
      baseItem({ id: "b", qto_no: "QTO-000002", quantity_status: "EXCLUDED", description: "Kerb", drawing_revision_id: null }),
      baseItem({ id: "c", qto_no: "QTO-000003", carry_status: "UNVERIFIED", description: "Wall" }),
    ] });
    const codes = issues.map((i) => `${i.severity}:${i.rule_code}`);
    expect(codes).toEqual(expect.arrayContaining([
      "BLOCKING:PROVISIONAL_NO_ASSUMPTION", "BLOCKING:EXCLUDED_NO_REASON", "BLOCKING:ITEM_NO_SOURCE", "WARNING:CARRY_UNVERIFIED",
    ]));
  });
  it("gives stable fingerprints so reruns do not duplicate issues (case 39)", () => {
    const items = [baseItem({ id: "a" }), baseItem({ id: "b", qto_no: "QTO-000002" })];
    const first = validateVersion({ version, items }).map((i) => i.fingerprint);
    const second = validateVersion({ version, items }).map((i) => i.fingerprint);
    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
    expect(first).toContain("DUPLICATE:a:b");
  });
  it("blocks unauthorised factors", () => {
    const issues = validateVersion({
      version, items: [baseItem({ id: "a" })],
      factorsByItem: { a: [{ id: "f", item_id: "a", factor_name: "Waste", factor_value: 2, sequence: 1, reason: null }] },
      ruleset: { rounding: final3, factors: [{ name: "Waste", min: 1, max: 1.2 }], rules: [] },
    });
    expect(issues.some((i) => i.rule_code === "UNAUTHORIZED_FACTOR" && i.severity === "BLOCKING")).toBe(true);
  });
});

describe("workflow mirror", () => {
  it("matches the server transition rules", () => {
    expect(canTransitionVersion("IN_PROGRESS", "SUBMITTED_FOR_REVIEW")).toBe(true);
    expect(canTransitionVersion("DRAFT", "APPROVED")).toBe(false);
    expect(canTransitionVersion("PUBLISHED", "IN_PROGRESS")).toBe(false);
    expect(isEditable("SUBMITTED_FOR_REVIEW")).toBe(false);
    expect(isEditable("CHANGES_REQUESTED")).toBe(true);
  });
});

describe("export", () => {
  const snapshot: QtoSnapshot = {
    schema: "dcos.qto.snapshot/1",
    session: { id: "s", code: "QTS-001", name: "Slab", purpose: "TENDER", tender_id: "t", project_id: null, trade: "STR", building: "BA" },
    version: { id: "v", no: 2, parent_version_id: null, baseline_version_id: null, reason: null, engine_version: ENGINE_VERSION, submitted_by: null, approved_by: null, approved_at: null },
    source: { drawing_revision_id: "r", drawing_id: "d", drawing_no: "S-100", revision: "P02", document_revision_id: null },
    ruleset: { version_id: "rv", ruleset_code: "DCOS-STD", version_no: 1 },
    items: [{
      id: "i", qto_no: "QTO-000001", item_code: "C-01", description: "Slab, \"C30\", 200mm", unit: "m3", quantity: 15.5,
      gross_qty: 16, deduction_qty: 0.5, factor_product: 1, quantity_status: "FIRM", exclusion_reason: null,
      provisional_assumption: null, building: "BA", level: "L01", zone: null, discipline: "STR", work_section: "Concrete",
      element: "=SUM(A1)", wbs_node_id: null, budget_code_id: null, rule_code: "VOL-LWD", drawing_revision_id: "r", page_no: 1,
      grid_location: "A-C/1-3", carried_from_item_id: null, carry_status: null, prepared_by: null, factors: [],
      calculation: null, boq_item_ids: [],
    }],
  };
  it("export values match the published snapshot (case 38)", () => {
    const [row] = buildExportRows(snapshot, "h".repeat(64));
    expect(row).toMatchObject({ qto_no: "QTO-000001", quantity: 15.5, gross_qty: 16, deduction_qty: 0.5, drawing: "S-100 Rev P02", ruleset: "DCOS-STD v1" });
  });
  it("writes valid CSV and neutralises spreadsheet formulas", () => {
    const csv = toCsv(buildExportRows(snapshot, "h"));
    const [, line] = csv.split("\r\n");
    expect(line).toContain('"Slab, ""C30"", 200mm"');
    expect(line).toContain(`"'=SUM(A1)"`);
    expect(line).toContain(",15.5,");
  });
});
