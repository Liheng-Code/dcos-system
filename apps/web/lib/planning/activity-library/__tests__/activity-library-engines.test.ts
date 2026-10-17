import { describe, expect, it } from "vitest";
import { adjustedProductivity, baseOutputPerDay, calculateDuration } from "../productivity-engine";
import { evaluateApplicability } from "../applicability";
import { assessConfidence } from "../confidence";
import { resolveQuantity, type QuantityProvider } from "../quantity-resolver";

describe("productivity engine", () => {
  it("multiplies base by factors", () => {
    const r = adjustedProductivity(60, [{ value: 0.95 }, { value: 1 }, { value: 1.05 }, { value: 1 }, { value: 1 }, { value: 0.98 }]);
    expect(r.adjusted).toBeCloseTo(58.653, 3);
  });

  it("master prompt example: 180 m3 at 62.7 m3/day => 3 days", () => {
    const d = calculateDuration(180, 62.7)!;
    expect(d.raw_days).toBeCloseTo(2.871, 3);
    expect(d.days).toBe(3);
  });

  it("does not round an exact result up", () => {
    expect(calculateDuration(120, 60)!.days).toBe(2);
  });

  it("supports half-day steps and a one-step minimum", () => {
    expect(calculateDuration(1, 60, 0.5)!.days).toBe(0.5);
    expect(calculateDuration(0, 60)!.days).toBe(0);
  });

  it("returns null for an unusable rate", () => {
    expect(calculateDuration(10, 0)).toBeNull();
  });

  it("derives output from labour constant when no direct rate", () => {
    const out = baseOutputPerDay({ output_per_day: null, labour_constant_hr_per_unit: 2, crew_workers: 12, hours_per_day: 10 });
    expect(out).toBe(60);
    expect(baseOutputPerDay({ output_per_day: 35, labour_constant_hr_per_unit: 2, crew_workers: 1, hours_per_day: 1 })).toBe(35);
  });
});

describe("applicability", () => {
  const rules = [
    { attribute: "project_type", operator: "in" as const, values: ["high_rise"] },
    { attribute: "structure_type", operator: "eq" as const, values: ["reinforced_concrete"] },
  ];
  it("applies when every rule matches", () => {
    expect(evaluateApplicability(rules, { project_type: "High_Rise", structure_type: "reinforced_concrete" }).applicable).toBe(true);
  });
  it("rejects steel structure", () => {
    expect(evaluateApplicability(rules, { project_type: "high_rise", structure_type: "steel" }).applicable).toBe(false);
  });
  it("reports missing attributes", () => {
    const r = evaluateApplicability(rules, { project_type: "high_rise" });
    expect(r.applicable).toBe(false);
    expect(r.missing).toEqual(["structure_type"]);
  });
  it("supports negative operators", () => {
    expect(evaluateApplicability([{ attribute: "a", operator: "not_in", values: ["x"] }], { a: "y" }).applicable).toBe(true);
  });
});

describe("confidence", () => {
  const ok = { hasQuantity: true, hasMethod: true, hasProductivity: true, productivityApproved: true, predecessorsResolved: true, templateApplicable: true };
  it("high when nothing is wrong", () => expect(assessConfidence(ok).confidence).toBe("high"));
  it("low on missing quantity", () => {
    const r = assessConfidence({ ...ok, hasQuantity: false });
    expect(r.confidence).toBe("low");
    expect(r.reasons).toContain("missing_quantity");
  });
  it("review on draft productivity only", () => {
    const r = assessConfidence({ ...ok, productivityApproved: false });
    expect(r.confidence).toBe("review");
    expect(r.reasons).toEqual(["draft_productivity"]);
  });
});

describe("quantity resolver", () => {
  const provider = (key: QuantityProvider["key"], data: Record<string, number>): QuantityProvider => ({
    key,
    get: async (_n, m) => (m in data ? { value: data[m], unit: "m³" } : null),
  });
  const rule = {
    metric_code: "slab_volume", unit: "m³", provider_priority: ["bim", "boq", "manual"] as ("bim" | "boq" | "manual")[],
    deduction_metrics: ["slab_opening_volume"], addition_metrics: ["approved_additional_volume"],
  };

  it("BIM first, with openings deducted and additions added", async () => {
    const r = await resolveQuantity(rule, "n1", [
      provider("bim", { slab_volume: 190, slab_opening_volume: 12, approved_additional_volume: 2 }),
      provider("boq", { slab_volume: 999 }),
    ]);
    expect(r.quantity).toBe(180);
    expect(r.provider).toBe("bim");
  });
  it("falls back to the next provider", async () => {
    const r = await resolveQuantity(rule, "n1", [provider("bim", {}), provider("boq", { slab_volume: 175 })]);
    expect(r.quantity).toBe(175);
    expect(r.provider).toBe("boq");
  });
  it("flags a missing quantity", async () => {
    const r = await resolveQuantity(rule, "n1", [provider("bim", {})]);
    expect(r.quantity).toBeNull();
    expect(r.issues).toContain("missing_quantity");
  });
});
