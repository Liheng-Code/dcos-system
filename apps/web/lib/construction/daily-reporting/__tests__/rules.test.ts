import { describe, expect, it } from "vitest";
import { applyCorrection, isEditable } from "../merge";
import { blockingErrors, evaluateRules, resolveRules, warnings, type RuleInput } from "../rules";
import { coverageBanner, derivedLabel } from "../status";
import { emptyPayload, type DrPayload, type RuleDefinition } from "../types";

const TASK = "11111111-1111-4111-8111-111111111111";
const OTHER_TASK = "22222222-2222-4222-8222-222222222222";

const def = (rule_code: string, severity: "ERROR" | "WARNING", params: Record<string, unknown> = {}): RuleDefinition => ({
  rule_code,
  point: "INTAKE",
  severity,
  params,
  version: 1,
  is_active: true,
  project_id: null,
});

const RULES: RuleDefinition[] = [
  def("REQ_FIELD", "ERROR"),
  def("INV_UNIT", "ERROR"),
  def("INV_WBS", "ERROR"),
  def("PROGRESS_MAX_100", "ERROR"),
  def("QTY_NEGATIVE", "ERROR"),
  def("UOM_MISMATCH", "ERROR"),
  def("DATE_FUTURE", "ERROR"),
  def("DUP_REPORT", "ERROR"),
  def("UNPLANNED_REASON", "ERROR"),
  def("EVIDENCE_MIN", "WARNING"),
  def("LATE_SUBMIT", "WARNING"),
  def("MANPOWER_BELOW_PLAN", "WARNING", { threshold_pct: 80 }),
  def("PROGRESS_REGRESS", "WARNING"),
  def("NEXT_DAY_MISSING_RESOURCE", "WARNING"),
  def("DELAY_NO_NOTICE_FLAG", "WARNING", { causes: ["EMPLOYER_CAUSED"] }),
];

function validPayload(): DrPayload {
  return {
    ...emptyPayload(),
    weather: { condition: "Sunny", hours_lost: 0, note: null },
    manpower: [{ line_id: "m1", trade: "Carpenter", planned_count: 10, reported_count: 10, hours: 8 }],
    activities: [
      { line_id: "a1", task_id: TASK, work_status: "in_progress", progress_today: 40, reported_qty: 120, uom: "m2" },
    ],
    safety: { toolbox_talk_held: true, observations: null, incident_count: 0, near_miss_count: 0 },
    next_day: [{ line_id: "n1", task_id: TASK, planned_manpower: 10 }],
  };
}

function input(overrides: Partial<RuleInput> = {}): RuleInput {
  return {
    payload: validPayload(),
    reportKind: "WORK",
    reportDate: "2026-10-03",
    todayLocal: "2026-10-04",
    unit: { status: "Active", required_sections: [], evidence_min_policy: { per_activity: 1, severity: "WARNING" } },
    activities: [{ task_id: TASK, quantity_unit: "m2" }],
    evidence: [{ target_section: "activities", target_line_id: "a1" }],
    rules: RULES,
    ...overrides,
  };
}

const codes = (i: RuleInput) => evaluateRules(i).map((r) => r.rule_code);

describe("daily report rules", () => {
  it("passes a complete report with no findings", () => {
    expect(evaluateRules(input())).toEqual([]);
  });

  it("blocks when a required section is missing", () => {
    const p = validPayload();
    p.manpower = [];
    p.safety = { toolbox_talk_held: null, observations: null, incident_count: 0, near_miss_count: 0 };
    const results = evaluateRules(input({ payload: p }));
    expect(blockingErrors(results).map((r) => r.target.section)).toEqual(["manpower", "safety"]);
  });

  it("requires extra sections configured on the unit", () => {
    const results = evaluateRules(
      input({ unit: { status: "Active", required_sections: ["equipment"], evidence_min_policy: {} } }),
    );
    expect(results.map((r) => r.target.section)).toContain("equipment");
  });

  it("rejects an activity outside the unit's scope", () => {
    const p = validPayload();
    p.activities[0].task_id = OTHER_TASK;
    expect(codes(input({ payload: p }))).toContain("INV_WBS");
  });

  it("requires a reason for an activity that is not on the plan", () => {
    const p = validPayload();
    p.activities = [{ line_id: "a1", task_id: null, progress_today: 10, free_text_activity: "Site clearing" }];
    expect(codes(input({ payload: p }))).toContain("UNPLANNED_REASON");

    p.activities[0] = { ...p.activities[0], unplanned: true, unplanned_reason: "Instructed by PM" };
    expect(codes(input({ payload: p, evidence: [{ target_section: "activities", target_line_id: "a1" }] }))).not.toContain(
      "UNPLANNED_REASON",
    );
  });

  it("rejects progress above 100, negative quantities and a wrong unit of measure", () => {
    const p = validPayload();
    p.activities[0] = { ...p.activities[0], progress_today: 120, reported_qty: -5, uom: "m3" };
    const found = codes(input({ payload: p }));
    expect(found).toEqual(expect.arrayContaining(["PROGRESS_MAX_100", "QTY_NEGATIVE", "UOM_MISMATCH"]));
  });

  it("compares the unit of measure case-insensitively and falls back to earlier reports", () => {
    const p = validPayload();
    p.activities[0].uom = "M2";
    expect(codes(input({ payload: p }))).not.toContain("UOM_MISMATCH");

    p.activities[0].uom = "m3";
    expect(
      codes(input({ payload: p, activities: [{ task_id: TASK, quantity_unit: null }], knownUom: { [TASK]: "m2" } })),
    ).toContain("UOM_MISMATCH");
  });

  it("rejects a future date and a duplicate", () => {
    expect(codes(input({ reportDate: "2026-10-05" }))).toContain("DATE_FUTURE");
    expect(codes(input({ duplicate: true }))).toContain("DUP_REPORT");
  });

  it("rejects submission from an inactive unit", () => {
    expect(codes(input({ unit: { status: "Suspended", required_sections: [], evidence_min_policy: {} } }))).toContain("INV_UNIT");
  });

  it("warns on missing evidence, and blocks when the unit's policy says so", () => {
    const warn = evaluateRules(input({ evidence: [] }));
    expect(warnings(warn).map((r) => r.rule_code)).toEqual(["EVIDENCE_MIN"]);
    expect(blockingErrors(warn)).toEqual([]);

    const block = evaluateRules(
      input({ evidence: [], unit: { status: "Active", required_sections: [], evidence_min_policy: { per_activity: 1, severity: "ERROR" } } }),
    );
    expect(blockingErrors(block).map((r) => r.rule_code)).toEqual(["EVIDENCE_MIN"]);
  });

  it("warns on late submission, low manpower and a next-day plan without manpower", () => {
    const p = validPayload();
    p.manpower[0].reported_count = 5;
    p.next_day[0].planned_manpower = 0;
    const found = warnings(evaluateRules(input({ payload: p, late: true }))).map((r) => r.rule_code);
    expect(found).toEqual(expect.arrayContaining(["LATE_SUBMIT", "MANPOWER_BELOW_PLAN", "NEXT_DAY_MISSING_RESOURCE"]));
  });

  it("uses yesterday's plan when today's lines carry no planned headcount", () => {
    const p = validPayload();
    p.manpower[0] = { line_id: "m1", trade: "Carpenter", reported_count: 4 };
    expect(codes(input({ payload: p, previousNextDay: [{ line_id: "n", planned_manpower: 10 }] }))).toContain("MANPOWER_BELOW_PLAN");
  });

  it("warns when progress falls below the approved figure without an explanation", () => {
    expect(codes(input({ approvedProgress: { [TASK]: 60 } }))).toContain("PROGRESS_REGRESS");
    const p = validPayload();
    p.activities[0].remarks = "Formwork struck and re-done after inspection";
    expect(codes(input({ payload: p, approvedProgress: { [TASK]: 60 } }))).not.toContain("PROGRESS_REGRESS");
  });

  it("warns when an employer-caused delay has no notice flag", () => {
    const p = validPayload();
    p.delays = [{ line_id: "d1", cause_category: "EMPLOYER_CAUSED", description: "Drawings late", hours_lost: 2 }];
    expect(codes(input({ payload: p }))).toContain("DELAY_NO_NOTICE_FLAG");
    p.delays[0].notice_required = true;
    expect(codes(input({ payload: p }))).not.toContain("DELAY_NO_NOTICE_FLAG");
  });

  it("needs only a reason for a No Work report", () => {
    const p = emptyPayload();
    expect(codes(input({ payload: p, reportKind: "NO_WORK" }))).toEqual(["REQ_FIELD"]);
    p.no_work_reason = "Heavy rain, site closed";
    expect(evaluateRules(input({ payload: p, reportKind: "NO_WORK" }))).toEqual([]);
  });

  it("lets a project override a rule's severity or switch it off", () => {
    const project = "p1";
    const defs = [...RULES, { ...def("EVIDENCE_MIN", "ERROR"), project_id: project }, { ...def("LATE_SUBMIT", "WARNING"), project_id: project, is_active: false }];
    const resolved = resolveRules(defs, project);
    expect(resolved.get("EVIDENCE_MIN")?.severity).toBe("ERROR");
    expect(resolved.has("LATE_SUBMIT")).toBe(false);
    expect(resolveRules(defs, "other").get("EVIDENCE_MIN")?.severity).toBe("WARNING");
    expect(codes(input({ late: true, rules: [...resolved.values()] }))).not.toContain("LATE_SUBMIT");
  });
});

describe("item-level correction", () => {
  const previous = (): DrPayload => ({
    ...validPayload(),
    activities: [
      { line_id: "a1", task_id: TASK, progress_today: 40, reported_qty: 120, uom: "m2" },
      { line_id: "a2", task_id: TASK, progress_today: 10, reported_qty: 5, uom: "m2" },
    ],
  });

  it("changes only the returned line", () => {
    const edited = previous();
    edited.activities[0].reported_qty = 90;
    edited.activities[1].reported_qty = 999; // not returned: must be ignored
    edited.manpower[0].reported_count = 50; // not returned: must be ignored

    const out = applyCorrection(previous(), edited, [{ target_section: "activities", target_line_id: "a1" }]);
    expect(out.activities[0].reported_qty).toBe(90);
    expect(out.activities[1].reported_qty).toBe(5);
    expect(out.manpower[0].reported_count).toBe(10);
  });

  it("replaces a whole section when the section itself was returned", () => {
    const edited = previous();
    edited.manpower = [{ line_id: "m9", trade: "Mason", reported_count: 3 }];
    edited.weather = { condition: "Rain", hours_lost: 3, note: null };
    const out = applyCorrection(previous(), edited, [{ target_section: "manpower" }, { target_section: "weather" }]);
    expect(out.manpower).toEqual(edited.manpower);
    expect(out.weather?.condition).toBe("Rain");
    expect(out.activities).toEqual(previous().activities);
  });

  it("drops a returned line the reporter removed and does not mutate its inputs", () => {
    const prev = previous();
    const edited = previous();
    edited.activities = [edited.activities[1]];
    const out = applyCorrection(prev, edited, [{ target_section: "activities", target_line_id: "a1" }]);
    expect(out.activities.map((a) => a.line_id)).toEqual(["a2"]);
    expect(prev.activities).toHaveLength(2);
  });

  it("reports which items are editable", () => {
    const items = [{ target_section: "activities" as const, target_line_id: "a1" }, { target_section: "weather" as const }];
    expect(isEditable(items, "activities", "a1")).toBe(true);
    expect(isEditable(items, "activities", "a2")).toBe(false);
    expect(isEditable(items, "weather")).toBe(true);
    expect(isEditable(items, "manpower")).toBe(false);
  });
});

describe("derived label and coverage", () => {
  it("derives one label from the independent state fields", () => {
    expect(derivedLabel({ submission_state: "SUBMITTED", review_state: "AWAITING_REVIEW" })).toBe("Awaiting PM");
    expect(derivedLabel({ submission_state: "RETURNED", review_state: "RETURNED" })).toBe("Returned — action required");
    expect(derivedLabel({ submission_state: "SUBMITTED", review_state: "APPROVED_WITH_REMARK" })).toBe("Approved");
    expect(derivedLabel({ submission_state: "SUBMITTED", review_state: "APPROVED" }, true)).toBe("Official");
    expect(derivedLabel({ submission_state: "WITHDRAWN", review_state: "AWAITING_REVIEW" })).toBe("Withdrawn");
    expect(derivedLabel({ submission_state: "SUBMITTED", review_state: "AMENDMENT_PENDING" })).toBe("Amendment pending");
  });

  it("states what is still unofficial", () => {
    expect(coverageBanner({ expected: 5, approved: 3, pending: 2, missing: 0 })).toBe("3 of 5 reports approved — 2 pending");
    expect(coverageBanner({ expected: 5, approved: 3, pending: 1, missing: 1 })).toBe("3 of 5 reports approved — 1 pending, 1 missing");
    expect(coverageBanner({ expected: 2, approved: 2, pending: 0, missing: 0 })).toBe("2 of 2 reports approved");
  });
});
