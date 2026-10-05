import { describe, expect, it } from "vitest";
import { evaluateRules, type RuleInput } from "../rules";
import { emptyPayload, type DrPayload, type HistoryDay, type RuleDefinition, type UnitHistory } from "../types";

const TASK = "11111111-1111-4111-8111-111111111111";

const def = (rule_code: string, params: Record<string, unknown> = {}, min_history_days = 0): RuleDefinition => ({
  rule_code,
  point: "POST_SUBMIT",
  severity: "WARNING",
  params,
  version: 1,
  is_active: true,
  project_id: null,
  min_history_days,
});

const JUMP = def("PROGRESS_JUMP", { window_days: 10, multiplier: 3, min_samples: 3 }, 10);
const BAND = def("PRODUCTIVITY_ABNORMAL", { window_days: 10, low_ratio: 0.4, high_ratio: 2.5, min_samples: 3 }, 10);

/** Approved days of the task, oldest first: 30 m2 a day with 10 workers, 5% a day. */
function steadyDays(count: number, over: Partial<HistoryDay> = {}): HistoryDay[] {
  return Array.from({ length: count }, (_, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, "0")}`,
    progress: (i + 1) * 5,
    qty: 30,
    uom: "m2",
    headcount: 10,
    ...over,
  }));
}

const history = (days: HistoryDay[], approved_days = 12): UnitHistory => ({ approved_days, tasks: { [TASK]: days } });

function payload(line: Partial<DrPayload["activities"][number]>): DrPayload {
  return {
    ...emptyPayload(),
    weather: { condition: "Sunny", hours_lost: 0, note: null },
    manpower: [{ line_id: "m1", trade: "Mason", reported_count: 10 }],
    activities: [{ line_id: "a1", task_id: TASK, progress_today: 35, reported_qty: 30, uom: "m2", headcount: 10, ...line }],
    safety: { toolbox_talk_held: true, observations: null, incident_count: 0, near_miss_count: 0 },
    next_day: [{ line_id: "n1", task_id: TASK, planned_manpower: 10 }],
  };
}

function input(overrides: Partial<RuleInput> = {}): RuleInput {
  return {
    payload: payload({}),
    reportKind: "WORK",
    reportDate: "2026-10-03",
    todayLocal: "2026-10-04",
    unit: { status: "Active", required_sections: [], evidence_min_policy: {} },
    activities: [{ task_id: TASK, quantity_unit: "m2" }],
    evidence: [],
    rules: [JUMP, BAND],
    approvedProgress: { [TASK]: 30 },
    history: history(steadyDays(6)),
    ...overrides,
  };
}

const find = (i: RuleInput, code: string) => evaluateRules(i).filter((r) => r.rule_code === code);

describe("statistical rules", () => {
  it("a day in line with the unit's history raises nothing", () => {
    expect(evaluateRules(input())).toEqual([]);
  });

  it("flags production far above the rolling average", () => {
    const [r] = find(input({ payload: payload({ reported_qty: 384, headcount: 40 }) }), "PROGRESS_JUMP");
    expect(r.severity).toBe("WARNING");
    expect(r.message).toBe("Reported production is 12.8x the 10-day average for this activity.");
    expect(r.params).toMatchObject({ baseline: 30, reported: 384, window_days: 10, measure: "qty", unit: "m2" });
    expect(r.target).toEqual({ section: "activities", line_id: "a1" });
  });

  it("does not flag production at exactly the multiplier", () => {
    expect(find(input({ payload: payload({ reported_qty: 90, headcount: 30 }) }), "PROGRESS_JUMP")).toEqual([]);
  });

  it("stays off until the unit has the minimum approved days", () => {
    const jumped = payload({ reported_qty: 384 });
    expect(evaluateRules(input({ payload: jumped, history: history(steadyDays(6), 9) }))).toEqual([]);
    expect(evaluateRules(input({ payload: jumped, history: undefined }))).toEqual([]);
    expect(find(input({ payload: jumped, history: history(steadyDays(6), 10) }), "PROGRESS_JUMP")).toHaveLength(1);
  });

  it("needs enough samples of the activity itself", () => {
    expect(evaluateRules(input({ payload: payload({ reported_qty: 384 }), history: history(steadyDays(2)) }))).toEqual([]);
  });

  it("looks only at the rolling window", () => {
    // Twelve old days at 300 m2 would hide the jump; only the last three are in the window.
    const days = [...steadyDays(12, { qty: 300 }), ...steadyDays(3)];
    const rules = [def("PROGRESS_JUMP", { window_days: 3, multiplier: 3, min_samples: 3 })];
    expect(find(input({ rules, payload: payload({ reported_qty: 120 }), history: history(days) }), "PROGRESS_JUMP")).toHaveLength(1);
    const wide = [def("PROGRESS_JUMP", { window_days: 15, multiplier: 3, min_samples: 3 })];
    expect(find(input({ rules: wide, payload: payload({ reported_qty: 120 }), history: history(days) }), "PROGRESS_JUMP")).toEqual([]);
  });

  it("falls back to the gain in progress when no quantity is reported", () => {
    const days = steadyDays(6, { qty: null, uom: null });
    const [r] = find(input({ payload: payload({ reported_qty: null, uom: null, progress_today: 70 }), history: history(days) }), "PROGRESS_JUMP");
    expect(r.params).toMatchObject({ baseline: 5, reported: 40, measure: "progress", unit: "%" });
    expect(r.message).toBe("Reported production is 8x the 10-day average for this activity.");
  });

  it("ignores history in another unit of measure", () => {
    const days = steadyDays(6, { uom: "m3", progress: null });
    expect(evaluateRules(input({ payload: payload({ reported_qty: 384 }), history: history(days) }))).toEqual([]);
  });

  it("flags output per worker outside the usual band, both ways", () => {
    const [highResult] = find(input({ payload: payload({ reported_qty: 80, headcount: 10 }) }), "PRODUCTIVITY_ABNORMAL");
    expect(highResult.message).toBe("Output per worker is 8 m2, above the usual 3 m2 for this activity.");
    expect(highResult.params).toMatchObject({ baseline: 3, reported: 8, measure: "qty" });

    const [lowResult] = find(input({ payload: payload({ reported_qty: 30, headcount: 30 }) }), "PRODUCTIVITY_ABNORMAL");
    expect(lowResult.message).toBe("Output per worker is 1 m2, below the usual 3 m2 for this activity.");
  });

  it("a bigger crew producing more is a jump, not abnormal productivity", () => {
    const results = evaluateRules(input({ payload: payload({ reported_qty: 120, headcount: 40 }) }));
    expect(results.map((r) => r.rule_code)).toEqual(["PROGRESS_JUMP"]);
  });

  it("says nothing about productivity without a headcount or on a day with no output", () => {
    expect(find(input({ payload: payload({ reported_qty: 80, headcount: null }) }), "PRODUCTIVITY_ABNORMAL")).toEqual([]);
    expect(evaluateRules(input({ payload: payload({ reported_qty: 0, progress_today: 30 }) }))).toEqual([]);
  });

  it("a rule that is switched off or not defined raises nothing", () => {
    expect(evaluateRules(input({ rules: [], payload: payload({ reported_qty: 384 }) }))).toEqual([]);
  });
});

describe("QTY_RANGE", () => {
  const RANGE = def("QTY_RANGE", { by_uom: { M2: { min: 5, max: 200 } }, max_daily_progress_pct: 40 });

  it("is silent until a range is configured", () => {
    const rules = [def("QTY_RANGE", { by_uom: {}, max_daily_progress_pct: null })];
    expect(evaluateRules(input({ rules, history: undefined, payload: payload({ reported_qty: 9999, progress_today: 100 }) }))).toEqual([]);
  });

  it("flags a quantity above or below the range for its unit, with no history needed", () => {
    const [above] = find(input({ rules: [RANGE], history: undefined, payload: payload({ reported_qty: 450 }) }), "QTY_RANGE");
    expect(above.message).toBe("Quantity 450 m2 is above the maximum 200 set for one day.");
    const [below] = find(input({ rules: [RANGE], history: undefined, payload: payload({ reported_qty: 2 }) }), "QTY_RANGE");
    expect(below.message).toBe("Quantity 2 m2 is below the minimum 5 set for one day.");
    expect(evaluateRules(input({ rules: [RANGE], history: undefined, payload: payload({ reported_qty: 200 }) }))).toEqual([]);
  });

  it("flags a rise in progress above the daily limit", () => {
    const [r] = find(input({ rules: [RANGE], history: undefined, payload: payload({ progress_today: 80 }) }), "QTY_RANGE");
    expect(r.message).toBe("Progress rose 50% in one day; the limit set for one day is 40%.");
  });

  it("takes the severity from the definition", () => {
    const rules = [{ ...RANGE, severity: "ERROR" as const }];
    expect(find(input({ rules, payload: payload({ reported_qty: 450 }) }), "QTY_RANGE")[0].severity).toBe("ERROR");
  });
});
