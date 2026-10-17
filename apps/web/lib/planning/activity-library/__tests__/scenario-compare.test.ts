import { describe, expect, it } from "vitest";
import { DEFAULT_CALENDAR } from "../../work-calendar";
import { applyVariant, BASE_VARIANT, delta, runScenario, variantIsBase, type ScenarioVariant } from "../scenario-compare";
import type { MasterContext, PlannerInput } from "../generation-planner";
import type { ActMethod, ActProductivityStandard, ActTemplateDependency, ActTemplateItem } from "../types";

const method = (id: string, code: string, isDefault: boolean): ActMethod => ({
  id, master_id: "conc", code, name: code, description: null, constraints_note: null, is_default: isDefault, sort_order: 1,
});
const std = (id: string, methodId: string, rate: number): ActProductivityStandard => ({
  id, code: id, name: id, unit: "m³", status: "approved", version: 1, method_id: methodId, output_per_day: rate,
  labour_constant_hr_per_unit: 1, hours_per_day_basis: 10, efficiency_pct: 100, basis_note: "x", factors: [], resources: [],
});
const item = (id: string, seq: number, master_id: string, extra: Partial<ActTemplateItem> = {}): ActTemplateItem => ({
  id, template_id: "t", seq, master_id, scope: "floor", method_id: null, norm_id: null, duration_days_override: null,
  is_milestone: false, note: null, ...extra,
});
const dep = (a: string, b: string): ActTemplateDependency => ({
  id: `${a}-${b}`, template_id: "t", predecessor_item_id: a, successor_item_id: b, relation: "fs", lag_days: 0, is_optional: false,
});

function base(): PlannerInput {
  const conc: MasterContext = {
    master: { id: "conc", code: "CONC", name: "Concrete", default_unit: "m³", discipline: "STR", version: 1 },
    methods: [method("m-pump", "PUMP", true), method("m-crane", "CRANE", false)],
    standards: [std("n-pump", "m-pump", 60), std("n-crane", "m-crane", 30)],
    quantityRule: { unit: "m³" },
  };
  const insp: MasterContext = {
    master: { id: "insp", code: "INSP", name: "Inspection", default_unit: "lot", discipline: "STR", version: 1 },
    methods: [], standards: [], quantityRule: null,
  };
  const q = { quantity: 180, unit: "m³", provider: "manual" as const, source_ref: null, deducted: {}, added: {}, issues: [] };
  return {
    template: { id: "t", version: 1 },
    items: [item("i1", 1, "insp", { duration_days_override: 1 }), item("i2", 2, "conc")],
    dependencies: [dep("i1", "i2")],
    nodes: [{ id: "L1", wbs_code: "L1", wbs_name: "Level 1" }, { id: "L2", wbs_code: "L2", wbs_name: "Level 2" }],
    contexts: { conc, insp },
    quantities: { "L1|conc": q, "L2|conc": q },
    existingTaskCodes: new Set(),
    templateApplicable: true,
    interLevel: { from_seq: 2, to_seq: 1, relation: "fs", lag_days: 0 },
    newId: () => "unused",
  };
}

const START = "2026-10-05"; // Monday
const run = (v: ScenarioVariant, p: string) =>
  runScenario(base(), v, base().nodes.map((n) => ({ id: n.id, wbs_name: n.wbs_name })), DEFAULT_CALENDAR, START, p);

describe("scenario compare", () => {
  it("base variant is recognised and leaves inputs equivalent", () => {
    expect(variantIsBase(BASE_VARIANT)).toBe(true);
    expect(variantIsBase({ ...BASE_VARIANT, productivityPct: 90 })).toBe(false);
  });

  it("a slower method lengthens the programme", () => {
    const a = run(BASE_VARIANT, "a");
    const b = run({ ...BASE_VARIANT, methodByMaster: { conc: "m-crane" } }, "b");
    // 180 / 60 = 3 days vs 180 / 30 = 6 days per level
    expect(a.metrics.taskDays).toBe(2 * (1 + 3));
    expect(b.metrics.taskDays).toBe(2 * (1 + 6));
    expect(b.metrics.spanDays!).toBeGreaterThan(a.metrics.spanDays!);
    expect(delta(b.metrics.taskDays, a.metrics.taskDays).delta).toBe(6);
  });

  it("productivity percentage scales durations", () => {
    const slow = run({ ...BASE_VARIANT, productivityPct: 50 }, "s");
    expect(slow.metrics.taskDays).toBe(2 * (1 + 6)); // 180 / 30
  });

  it("switching off level linking lets levels overlap", () => {
    const linked = run(BASE_VARIANT, "l");
    const free = run({ ...BASE_VARIANT, linkLevels: false }, "f");
    expect(free.metrics.spanDays!).toBeLessThan(linked.metrics.spanDays!);
  });

  it("is deterministic and does not mutate the base input", () => {
    const input = base();
    const before = JSON.stringify(input.items);
    const v = { ...BASE_VARIANT, methodByMaster: { conc: "m-crane" } };
    applyVariant(input, v, "x");
    expect(JSON.stringify(input.items)).toBe(before);
    expect(run(v, "d").metrics.taskDays).toBe(run(v, "d").metrics.taskDays);
  });

  it("reports per-level figures", () => {
    const a = run(BASE_VARIANT, "p");
    expect(a.metrics.perLevel.map((l) => l.taskDays)).toEqual([4, 4]);
    expect(a.metrics.perLevel[1].spanDays).not.toBeNull();
  });

  it("counts activities without a duration", () => {
    const input = base();
    input.quantities = {};
    const r = runScenario(input, BASE_VARIANT, input.nodes.map((n) => ({ id: n.id, wbs_name: n.wbs_name })), DEFAULT_CALENDAR, START, "u");
    expect(r.metrics.unsized).toBe(2);
    expect(r.metrics.low).toBe(2);
  });
});
