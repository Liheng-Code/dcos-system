import { describe, expect, it } from "vitest";
import { planGeneration, type MasterContext, type PlannerInput } from "../generation-planner";
import type { ActProductivityStandard, ActTemplateDependency, ActTemplateItem } from "../types";

let n = 0;
const newId = () => `id-${++n}`;

const standard: ActProductivityStandard = {
  id: "norm-pump", code: "N1", name: "Pump", unit: "m³", status: "approved", version: 1, method_id: "m-pump",
  output_per_day: 60, labour_constant_hr_per_unit: 2, hours_per_day_basis: 10, efficiency_pct: 100, basis_note: "x",
  factors: [{ factor_type: "height", label: "h", value: 0.95, condition_note: null }, { factor_type: "crew", label: "c", value: 1.05, condition_note: null }],
  resources: [],
};

const ctx = (id: string, code: string, extra: Partial<MasterContext> = {}): MasterContext => ({
  master: { id, code, name: code, default_unit: "m³", discipline: "STR", version: 1 },
  methods: [], standards: [], quantityRule: null, ...extra,
});

const item = (id: string, seq: number, master_id: string, extra: Partial<ActTemplateItem> = {}): ActTemplateItem => ({
  id, template_id: "t", seq, master_id, scope: "floor", method_id: null, norm_id: null, duration_days_override: null, is_milestone: false, note: null, ...extra,
});
const dep = (a: string, b: string, lag = 0): ActTemplateDependency => ({
  id: `${a}-${b}`, template_id: "t", predecessor_item_id: a, successor_item_id: b, relation: "fs", lag_days: lag, is_optional: false,
});

function base(): PlannerInput {
  return {
    template: { id: "t", version: 1 },
    items: [
      item("i1", 1, "insp", { duration_days_override: 0.5 }),
      item("i2", 2, "conc"),
    ],
    dependencies: [dep("i1", "i2")],
    nodes: [{ id: "L05", wbs_code: "L05", wbs_name: "Level 05" }, { id: "L06", wbs_code: "L06", wbs_name: "Level 06" }],
    contexts: {
      insp: ctx("insp", "INSP"),
      conc: ctx("conc", "CONC", {
        methods: [{ id: "m-pump", master_id: "conc", code: "PUMP", name: "Pump", description: null, constraints_note: null, is_default: true, sort_order: 1 }],
        standards: [standard], quantityRule: { unit: "m³" },
      }),
    },
    quantities: {
      "L05|conc": { quantity: 180, unit: "m³", provider: "bim", source_ref: null, deducted: {}, added: {}, issues: [] },
    },
    existingTaskCodes: new Set(),
    templateApplicable: true,
    newId,
  };
}

describe("planGeneration", () => {
  it("generates the recipe for every node with calculated duration and logic", () => {
    const r = planGeneration(base());
    expect(r.tasks).toHaveLength(4);
    const conc = r.tasks.find((t) => t.task_code === "CONC@L05")!;
    // 60 x 0.95 x 1.05 = 59.85 m3/day; 180 / 59.85 = 3.007 -> 4 days
    expect(conc.duration_days).toBe(4);
    expect(conc.activity_method_id).toBe("m-pump");
    const insp = r.tasks.find((t) => t.task_code === "INSP@L05")!;
    expect(conc.dependency_task_ids).toEqual([insp.id]);
    expect(conc.dependency_types).toEqual(["fs"]);
    expect(insp.duration_days).toBe(0.5);
  });

  it("flags a missing quantity as low confidence", () => {
    const r = planGeneration(base());
    const noQty = r.items.find((i) => i.node_id === "L06" && i.master_id === "conc")!;
    expect(noQty.confidence).toBe("low");
    expect(noQty.reasons).toContain("missing_quantity");
    expect(r.tasks.find((t) => t.task_code === "CONC@L06")!.duration_days).toBeNull();
  });

  it("counts confidence buckets", () => {
    const r = planGeneration(base());
    expect(r.counts.total).toBe(4);
    expect(r.counts.low).toBe(1);
    expect(r.counts.high).toBe(3);
  });

  it("skips tasks that already exist, so re-running is safe", () => {
    const input = base();
    input.existingTaskCodes = new Set(["INSP@L05"]);
    const r = planGeneration(input);
    expect(r.skipped).toEqual([{ node_id: "L05", task_code: "INSP@L05" }]);
    expect(r.tasks).toHaveLength(3);
    expect(r.counts.warnings).toBe(1);
  });

  it("draft productivity is review, not high", () => {
    const input = base();
    input.contexts.conc.standards = [{ ...standard, status: "draft" }];
    const r = planGeneration(input);
    const item = r.items.find((i) => i.node_id === "L05" && i.master_id === "conc")!;
    expect(item.confidence).toBe("review");
    expect(item.reasons).toEqual(["draft_productivity"]);
  });

  it("records library versions used", () => {
    const r = planGeneration(base());
    expect(r.snapshot.norms["norm-pump"]).toEqual({ code: "N1", version: 1, status: "approved" });
    expect(r.snapshot.masters.conc).toEqual({ code: "CONC", version: 1 });
  });

  it("an inapplicable template makes every item low", () => {
    const input = base();
    input.templateApplicable = false;
    expect(planGeneration(input).items.every((i) => i.confidence === "low")).toBe(true);
  });

  it("links consecutive levels when the template defines it", () => {
    const input = base();
    input.interLevel = { from_seq: 2, to_seq: 1, relation: "fs", lag_days: 1 };
    const r = planGeneration(input);
    const l5Conc = r.tasks.find((t) => t.task_code === "CONC@L05")!;
    const l6Insp = r.tasks.find((t) => t.task_code === "INSP@L06")!;
    expect(l6Insp.dependency_task_ids).toEqual([l5Conc.id]);
    expect(l6Insp.dependency_types).toEqual(["fs"]);
    expect(l6Insp.dependency_lag_days).toEqual([1]);
    // the first level has nothing before it
    expect(r.tasks.find((t) => t.task_code === "INSP@L05")!.dependency_task_ids).toEqual([]);
  });

  it("does not link levels when no inter-level rule is given", () => {
    const r = planGeneration(base());
    expect(r.tasks.find((t) => t.task_code === "INSP@L06")!.dependency_task_ids).toEqual([]);
  });
});

describe("standard selection across versions", () => {
  it("prefers the newest approved version, and approved over a newer draft", () => {
    const v1 = { ...standard, id: "n-v1", version: 1 };
    const v2 = { ...standard, id: "n-v2", version: 2 };
    const input = base();
    input.contexts.conc.standards = [v1, v2];
    const both = planGeneration(input).items.find((i) => i.node_id === "L05" && i.master_id === "conc")!;
    expect(both.norm_id).toBe("n-v2");

    input.contexts.conc.standards = [v1, { ...v2, status: "draft" }];
    const mixed = planGeneration(input).items.find((i) => i.node_id === "L05" && i.master_id === "conc")!;
    expect(mixed.norm_id).toBe("n-v1");
  });
});
