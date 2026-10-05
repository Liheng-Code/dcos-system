// Module 10-01 Daily Reporting — the short Telegram form: its payload mapping,
// the custom-field rules, and the reporter invite tokens.

import { describe, expect, it } from "vitest";
import { blankState, buildPayload, stateFromPayload, type MiniFormState } from "../mini-form";
import { blockingErrors, evaluateRules, type RuleInput } from "../rules";
import { INVITE_PARAM_PREFIX, newInviteToken, parseInviteStartParam, parseLaunchStartParam } from "../telegram/tokens";
import { payloadSchema, type CustomField, type FormActivity, type RuleDefinition } from "../types";

const TASK = "11111111-1111-4111-8111-111111111111";
const TASK2 = "22222222-2222-4222-8222-222222222222";
const NODE = "33333333-3333-4333-8333-333333333333";

const activity = (task_id: string, overrides: Partial<FormActivity> = {}): FormActivity => ({
  task_id,
  task_code: "A-1",
  task_name: "Blockwork",
  wbs_node_id: NODE,
  discipline: "Masonry",
  current_progress: 40,
  start_date: null,
  end_date: null,
  quantity_unit: "m2",
  suggested_trade: "MASON",
  steps: [],
  planned_today: true,
  location: "Building A › L06",
  ...overrides,
});
const TASKS = new Map([activity(TASK), activity(TASK2, { task_name: "Plaster", current_progress: 0 })].map((a) => [a.task_id, a]));

const def = (rule_code: string, severity: "ERROR" | "WARNING"): RuleDefinition => ({
  rule_code,
  point: "INTAKE",
  severity,
  params: {},
  version: 1,
  is_active: true,
  project_id: null,
});
const RULES = [def("REQ_FIELD", "ERROR"), def("INV_WBS", "ERROR"), def("PROGRESS_MAX_100", "ERROR"), def("QTY_NEGATIVE", "ERROR"), def("EVIDENCE_MIN", "WARNING")];

const filled = (overrides: Partial<MiniFormState> = {}): MiniFormState => ({
  ...blankState(),
  weather: "Sunny",
  toolbox: true,
  lines: [{ id: "a1", location: "Building A › L06", taskId: TASK, manpower: "24", progress: "65" }],
  issue: "No issue",
  tomorrow: "Continue L06 blockwork",
  ...overrides,
});

const rules = (state: MiniFormState, customFields?: CustomField[], extra: Partial<RuleInput> = {}) =>
  evaluateRules({
    payload: buildPayload(state, TASKS, "Masonry"),
    reportKind: state.noWork ? "NO_WORK" : "WORK",
    reportDate: "2026-10-04",
    todayLocal: "2026-10-04",
    unit: { status: "Active", required_sections: [], evidence_min_policy: { per_activity: 1, severity: "WARNING" } },
    activities: [...TASKS.values()],
    evidence: [],
    rules: RULES,
    customFields,
    ...extra,
  });

describe("short form to payload", () => {
  it("the mock-up's report becomes a payload the gateway accepts with no errors", () => {
    const payload = buildPayload(filled(), TASKS, "Masonry");
    expect(payloadSchema.safeParse(payload).success).toBe(true);
    expect(payload.activities).toEqual([
      expect.objectContaining({ line_id: "a1", task_id: TASK, wbs_node_id: NODE, progress_before: 40, progress_today: 65, headcount: 24, uom: "m2", work_status: "in_progress" }),
    ]);
    expect(payload.manpower).toEqual([expect.objectContaining({ trade: "Masonry", reported_count: 24 })]);
    expect(payload.next_day).toEqual([expect.objectContaining({ description: "Continue L06 blockwork", planned_manpower: 24 })]);
    expect(payload.weather?.condition).toBe("Sunny");
    expect(payload.safety?.toolbox_talk_held).toBe(true);
    expect(blockingErrors(rules(filled()))).toEqual([]);
  });

  it('"No issue" and its variants record no issue; anything else is recorded as one', () => {
    for (const text of ["", "No issue", "no issues", "None", "N/A", "-"]) {
      expect(buildPayload(filled({ issue: text }), TASKS, "Masonry").issues).toEqual([]);
    }
    expect(buildPayload(filled({ issue: "Scaffold not released at L06" }), TASKS, "Masonry").issues).toEqual([
      expect.objectContaining({ description: "Scaffold not released at L06" }),
    ]);
  });

  it("several activities add up to one manpower line, and 100% marks an activity completed", () => {
    const payload = buildPayload(
      filled({
        lines: [
          { id: "a1", location: "L06", taskId: TASK, manpower: "24", progress: "100" },
          { id: "a2", location: "L06", taskId: TASK2, manpower: "6", progress: "10" },
          { id: "a3", location: "", taskId: "", manpower: "", progress: "" },
        ],
      }),
      TASKS,
      "Masonry",
    );
    expect(payload.activities).toHaveLength(2);
    expect(payload.activities[0].work_status).toBe("completed");
    expect(payload.manpower[0].reported_count).toBe(30);
  });

  it("an empty form is refused with the fields the reporter must fill", () => {
    const messages = blockingErrors(rules(blankState())).map((r) => r.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        "Weather condition is required.",
        "Add at least one manpower line.",
        "Add at least one activity.",
        "State whether a toolbox talk was held.",
        "Add the plan for the next day.",
      ]),
    );
  });

  it("missing progress, progress above 100 and negative manpower are refused", () => {
    const line = { id: "a1", location: "L06", taskId: TASK };
    expect(blockingErrors(rules(filled({ lines: [{ ...line, manpower: "5", progress: "" }] }))).map((r) => r.rule_code)).toContain("REQ_FIELD");
    expect(blockingErrors(rules(filled({ lines: [{ ...line, manpower: "5", progress: "140" }] }))).map((r) => r.rule_code)).toContain("PROGRESS_MAX_100");
    expect(blockingErrors(rules(filled({ lines: [{ ...line, manpower: "-3", progress: "50" }] }))).map((r) => r.rule_code)).toContain("QTY_NEGATIVE");
  });

  it("No Work Today needs only a reason", () => {
    expect(blockingErrors(rules(filled({ noWork: true, noWorkReason: "" }))).map((r) => r.message)).toEqual(["Give the reason there was no work today."]);
    const state = filled({ noWork: true, noWorkReason: "Heavy rain all day" });
    expect(blockingErrors(rules(state))).toEqual([]);
    const payload = buildPayload(state, TASKS, "Masonry");
    expect(payload.no_work_reason).toBe("Heavy rain all day");
    expect(payload.activities).toEqual([]);
  });

  it("a server draft restores the short form", () => {
    const state = filled({ issue: "Scaffold not released", custom: { wall_type: "Hollow Clay Brick" } });
    const restored = stateFromPayload(buildPayload(state, TASKS, "Masonry"), TASKS);
    expect(restored).toMatchObject({
      weather: "Sunny",
      toolbox: true,
      issue: "Scaffold not released",
      tomorrow: "Continue L06 blockwork",
      custom: { wall_type: "Hollow Clay Brick" },
      lines: [{ id: "a1", location: "Building A › L06", taskId: TASK, manpower: "24", progress: "65" }],
    });
  });

  it("a draft pointing at an activity no longer in scope restores without it", () => {
    const payload = buildPayload(filled(), TASKS, "Masonry");
    const restored = stateFromPayload(payload, new Map());
    expect(restored.lines).toHaveLength(1);
    expect(restored.lines[0].taskId).toBe("");
  });
});

describe("custom fields", () => {
  const FIELDS: CustomField[] = [
    { key: "wall_type", label: "Wall Type", type: "select", options: ["Hollow Clay Brick", "AAC Block"], required: true },
    { key: "wall_thickness", label: "Wall Thickness", type: "number", unit: "mm", required: true },
    { key: "area_completed", label: "Area Completed", type: "number", unit: "m²" },
    { key: "crew_leader", label: "Crew Leader", type: "text" },
  ];
  const custom = { wall_type: "Hollow Clay Brick", wall_thickness: 100, area_completed: 125, crew_leader: "Mr. Sok" };

  it("the mock-up's values pass and travel in the payload", () => {
    const state = filled({ custom });
    expect(blockingErrors(rules(state, FIELDS))).toEqual([]);
    const payload = buildPayload(state, TASKS, "Masonry");
    expect(payload.custom_fields).toEqual(custom);
    expect(payloadSchema.safeParse(payload).success).toBe(true);
  });

  it("required fields must be filled; optional ones may be left empty", () => {
    const errors = blockingErrors(rules(filled({ custom: { crew_leader: "Mr. Sok" } }), FIELDS));
    expect(errors.map((r) => r.message)).toEqual(["Wall Type is required.", "Wall Thickness is required."]);
    expect(errors.every((r) => r.params?.field)).toBe(true);
    expect(blockingErrors(rules(filled({ custom: { wall_type: "AAC Block", wall_thickness: 150 } }), FIELDS))).toEqual([]);
  });

  it("a choice must be one of the options and a number must be a number", () => {
    const errors = blockingErrors(rules(filled({ custom: { wall_type: "Gold bricks", wall_thickness: "thick" as unknown as number } }), FIELDS));
    expect(errors.map((r) => r.message)).toEqual(["Wall Type: choose one of the listed options.", "Wall Thickness must be a number."]);
  });

  it("a unit without custom fields is not checked for any", () => {
    expect(blockingErrors(rules(filled({ custom }), undefined))).toEqual([]);
    expect(blockingErrors(rules(filled(), []))).toEqual([]);
  });

  it("a No Work report is not asked for custom fields", () => {
    expect(blockingErrors(rules(filled({ noWork: true, noWorkReason: "Holiday" }), FIELDS))).toEqual([]);
  });
});

describe("reporter invite tokens", () => {
  it("an invite fits Telegram's start parameter and is told apart from a launch token", () => {
    const token = newInviteToken();
    const param = `${INVITE_PARAM_PREFIX}${token}`;
    expect(param.length).toBeLessThanOrEqual(64);
    expect(parseInviteStartParam(param)).toBe(token);
    expect(parseLaunchStartParam(param)).toBeNull();
    expect(parseInviteStartParam(`dr_${token}`)).toBeNull();
    expect(parseInviteStartParam("inv_short")).toBeNull();
    expect(parseInviteStartParam(undefined)).toBeNull();
  });
});
