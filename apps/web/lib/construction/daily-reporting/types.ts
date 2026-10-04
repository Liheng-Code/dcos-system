// Module 10-01 Daily Reporting — shared types and the report payload schema.
// The payload is the authoritative content of a report version (stored as
// dr_report_versions.payload); the dr_* line tables are projections of it.
// Pure module: imported by the form, the API routes and the rules engine.

import { z } from "zod";

export const DR_SCHEMA_VERSION = 1;

export const WORK_STATUSES = ["not_started", "in_progress", "completed", "hindered", "stopped"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const DELAY_CAUSES = [
  "EMPLOYER_CAUSED",
  "CONTRACTOR_CAUSED",
  "SUBCONTRACTOR_CAUSED",
  "DESIGN_INFORMATION",
  "WEATHER",
  "THIRD_PARTY_UTILITY",
  "AUTHORITY",
  "FORCE_MAJEURE",
  "MATERIAL_SUPPLY",
  "ACCESS_NOT_RELEASED",
  "OTHER",
] as const;
export type DelayCause = (typeof DELAY_CAUSES)[number];

export const DELAY_TYPES = ["excusable", "non_excusable", "compensable", "non_compensable"] as const;
export type DelayType = (typeof DELAY_TYPES)[number];

/**
 * Proposed contractual classification per cause. A proposal only: the PM
 * confirms or changes it at approval, and nothing reaches delay_register
 * without that confirmation.
 */
export const PROPOSED_DELAY_TYPE: Record<DelayCause, DelayType> = {
  EMPLOYER_CAUSED: "compensable",
  DESIGN_INFORMATION: "excusable",
  CONTRACTOR_CAUSED: "non_excusable",
  SUBCONTRACTOR_CAUSED: "non_excusable",
  WEATHER: "non_compensable",
  MATERIAL_SUPPLY: "non_excusable",
  THIRD_PARTY_UTILITY: "excusable",
  AUTHORITY: "excusable",
  FORCE_MAJEURE: "non_compensable",
  ACCESS_NOT_RELEASED: "compensable",
  OTHER: "non_excusable",
};

export const ISSUE_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const ACCESS_STATES = ["RELEASED", "BLOCKED", "PARTIAL"] as const;

/** Sections of a report. Correction items and evidence target these. */
export const SECTIONS = [
  "weather",
  "manpower",
  "activities",
  "equipment",
  "materials",
  "delays",
  "issues",
  "instructions",
  "inspections",
  "safety",
  "area_access",
  "next_day",
  "evidence",
] as const;
export type SectionKey = (typeof SECTIONS)[number];

/** Sections every WORK report must contain (design §9.1). */
export const ALWAYS_REQUIRED_SECTIONS: SectionKey[] = ["weather", "manpower", "activities", "safety", "next_day"];

/** Sections that hold a list of lines (each line has a line_id). */
export const LIST_SECTIONS = [
  "manpower",
  "activities",
  "equipment",
  "materials",
  "delays",
  "issues",
  "instructions",
  "inspections",
  "area_access",
  "next_day",
] as const;
export type ListSectionKey = (typeof LIST_SECTIONS)[number];

// Upper bounds keep one report to a sane size; they are far above real use.
const MAX_LINES = 300;
const MAX_TEXT = 4000;
const num = z.number().finite();
const optNum = num.nullable().optional();
const optStr = z.string().max(MAX_TEXT).nullable().optional();
const lineId = z.string().min(1).max(64);
const text = z.string().max(MAX_TEXT);

const stepProgressSchema = z.object({
  step_id: z.string(),
  step_no: z.number(),
  step_name: z.string(),
  progress: z.number(),
  weight: z.number(),
});

export const activitySchema = z.object({
  line_id: lineId,
  task_id: z.string().uuid().nullable().optional(),
  wbs_node_id: z.string().uuid().nullable().optional(),
  discipline: optStr,
  work_status: z.enum(WORK_STATUSES).nullable().optional(),
  progress_before: optNum,
  progress_today: optNum,
  reported_qty: optNum,
  uom: optStr,
  trade_code: optStr,
  headcount: optNum,
  hours_normal: optNum,
  hours_ot: optNum,
  step_progress: z.array(stepProgressSchema).max(200).optional(),
  actual_start_date: optStr,
  actual_finish_date: optStr,
  unplanned: z.boolean().optional(),
  unplanned_reason: optStr,
  free_text_activity: optStr,
  remarks: optStr,
});

export const payloadSchema = z.object({
  schema_version: z.literal(DR_SCHEMA_VERSION),
  no_work_reason: optStr,
  weather: z
    .object({ condition: optStr, hours_lost: optNum, note: optStr })
    .nullable()
    .optional(),
  manpower: z
    .array(
      z.object({
        line_id: lineId,
        trade: text,
        planned_count: optNum,
        reported_count: optNum,
        supervisors: optNum,
        hours: optNum,
      }),
    )
    .max(MAX_LINES).default([]),
  activities: z.array(activitySchema).max(MAX_LINES).default([]),
  equipment: z
    .array(
      z.object({
        line_id: lineId,
        equipment_type: text,
        asset_ref: optStr,
        hours_working: optNum,
        hours_idle: optNum,
        hours_breakdown: optNum,
      }),
    )
    .max(MAX_LINES).default([]),
  materials: z
    .array(
      z.object({
        line_id: lineId,
        description: text,
        qty_delivered: optNum,
        qty_used: optNum,
        uom: optStr,
        delivery_note_ref: optStr,
      }),
    )
    .max(MAX_LINES).default([]),
  delays: z
    .array(
      z.object({
        line_id: lineId,
        cause_category: z.enum(DELAY_CAUSES),
        description: text,
        start_at: optStr,
        end_at: optStr,
        hours_lost: optNum,
        task_id: z.string().uuid().nullable().optional(),
        wbs_node_id: z.string().uuid().nullable().optional(),
        notice_required: z.boolean().optional(),
      }),
    )
    .max(MAX_LINES).default([]),
  issues: z
    .array(
      z.object({
        line_id: lineId,
        issue_type: optStr,
        severity: z.enum(ISSUE_SEVERITIES).nullable().optional(),
        description: text,
        action_required_from: optStr,
      }),
    )
    .max(MAX_LINES).default([]),
  instructions: z
    .array(
      z.object({
        line_id: lineId,
        instruction_type: z.enum(["VERBAL", "WRITTEN"]).nullable().optional(),
        given_by: optStr,
        reference: optStr,
        description: text,
      }),
    )
    .max(MAX_LINES).default([]),
  inspections: z
    .array(
      z.object({
        line_id: lineId,
        wbs_node_id: z.string().uuid().nullable().optional(),
        reference: optStr,
        status: optStr,
      }),
    )
    .max(MAX_LINES).default([]),
  safety: z
    .object({
      toolbox_talk_held: z.boolean().nullable().optional(),
      observations: optStr,
      incident_count: optNum,
      near_miss_count: optNum,
    })
    .nullable()
    .optional(),
  area_access: z
    .array(
      z.object({
        line_id: lineId,
        wbs_node_id: z.string().uuid().nullable().optional(),
        access_state: z.enum(ACCESS_STATES),
        note: optStr,
      }),
    )
    .max(MAX_LINES).default([]),
  next_day: z
    .array(
      z.object({
        line_id: lineId,
        task_id: z.string().uuid().nullable().optional(),
        description: optStr,
        planned_manpower: optNum,
        planned_qty: optNum,
      }),
    )
    .max(MAX_LINES).default([]),
});

export type DrPayload = z.infer<typeof payloadSchema>;
export type DrActivity = z.infer<typeof activitySchema>;

export function emptyPayload(): DrPayload {
  return {
    schema_version: DR_SCHEMA_VERSION,
    weather: { condition: null, hours_lost: 0, note: null },
    manpower: [],
    activities: [],
    equipment: [],
    materials: [],
    delays: [],
    issues: [],
    instructions: [],
    inspections: [],
    safety: { toolbox_talk_held: null, observations: null, incident_count: 0, near_miss_count: 0 },
    area_access: [],
    next_day: [],
  };
}

/** Evidence reference carried with a submission (the file is already uploaded). */
export const evidenceRefSchema = z.object({
  storage_key: z.string().min(1),
  target_section: z.enum(SECTIONS),
  target_line_id: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  captured_at_device: z.string().nullable().optional(),
  gps_lat: z.number().nullable().optional(),
  gps_lng: z.number().nullable().optional(),
});
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;

export type ReportKind = "WORK" | "NO_WORK";
export type SubmissionState = "DRAFT" | "QUEUED_OFFLINE" | "SUBMITTED" | "RETURNED" | "WITHDRAWN";
export type ReviewState =
  | "AWAITING_REVIEW"
  | "IN_REVIEW"
  | "INFO_REQUESTED"
  | "RETURNED"
  | "APPROVED"
  | "APPROVED_WITH_REMARK"
  | "AMENDMENT_PENDING";
export type ReviewDecision = "APPROVE" | "APPROVE_WITH_REMARK" | "REQUEST_INFO" | "RETURN";
export type RuleSeverity = "ERROR" | "WARNING";

export interface RuleResult {
  rule_code: string;
  rule_version: number;
  status: "FAILED";
  severity: RuleSeverity;
  message: string;
  params: Record<string, unknown>;
  target: { section?: SectionKey | "header"; line_id?: string };
}

export interface RuleDefinition {
  rule_code: string;
  point: "INTAKE" | "POST_SUBMIT";
  severity: RuleSeverity;
  params: Record<string, unknown>;
  version: number;
  is_active: boolean;
  project_id: string | null;
}

export interface ReportingUnit {
  id: string;
  project_id: string;
  unit_code: string;
  unit_type: "SUBCONTRACTOR" | "IN_HOUSE_TEAM";
  subcontract_id: string | null;
  department_id: string | null;
  display_name: string;
  discipline_scope: string[];
  schedule_id: string | null;
  required_sections: SectionKey[];
  evidence_min_policy: { per_activity?: number; per_report?: number; severity?: RuleSeverity };
  status: "Planned" | "Active" | "Suspended" | "Demobilised";
  mobilised_at: string | null;
  demobilised_at: string | null;
}

export interface DrReport {
  id: string;
  report_no: string;
  project_id: string;
  unit_id: string;
  report_date: string;
  report_kind: ReportKind;
  current_version_no: number;
  approved_version_no: number | null;
  submission_state: SubmissionState;
  assurance_state: string;
  review_state: ReviewState;
  sync_state: string;
  late_flag: boolean;
  backdated_flag: boolean;
  imported_flag: boolean;
  /** Reasons an offline report needs the approver's attention (Phase 1B). */
  review_flags: string[];
  warning_count: number;
  first_submitted_at: string;
  approved_at: string | null;
  approved_by: string | null;
  unit?: Pick<ReportingUnit, "unit_code" | "display_name" | "unit_type"> | null;
}

export interface DrReportVersion {
  id: string;
  report_id: string;
  version_no: number;
  version_kind: "ORIGINAL" | "CORRECTION" | "AMENDMENT";
  report_kind: ReportKind;
  payload: DrPayload;
  content_hash: string;
  submitted_by: string | null;
  submitted_at: string;
  channel: string;
  change_reason: string | null;
}

export interface DrEvidence {
  id: string;
  version_id: string;
  target_section: string;
  target_line_id: string | null;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  captured_at_device: string | null;
  received_at_server: string;
  caption: string | null;
  scan_status: string;
}

export interface CorrectionItem {
  target_section: SectionKey;
  target_line_id?: string | null;
  reason: string;
  required_action?: string | null;
}

export interface CorrectionRequest {
  id: string;
  report_id: string;
  based_on_version_no: number;
  request_kind: "RETURN" | "REQUEST_INFO";
  status: string;
  message: string;
  response: string | null;
  sent_at: string;
  items: (CorrectionItem & { id: string })[];
}

export interface DailySummary {
  id: string;
  project_id: string;
  summary_date: string;
  revision_no: number;
  status: "Live" | "Official" | "Superseded";
  coverage: {
    expected: number;
    submitted: number;
    approved: number;
    no_work: number;
    pending: number;
    late: number;
    missing: number;
    units: {
      unit_id: string;
      unit_code: string;
      display_name: string;
      report_id: string | null;
      report_no: string | null;
      report_kind: ReportKind | null;
      state: "MISSING" | "PENDING" | "APPROVED";
      late: boolean;
    }[];
  };
  totals: {
    manpower_total: number;
    manpower_by_trade: { trade: string; count: number }[];
    activities: Record<string, number>;
    quantities: {
      task_id: string | null;
      task_code: string | null;
      task_name: string | null;
      uom: string | null;
      reported_qty: number | null;
      verified_qty: number | null;
      adjusted: boolean;
      progress: number | null;
    }[];
    delay_events: number;
    delay_hours_lost: number;
    delay_notices: number;
    weather_hours_lost: number;
    issues: number;
    issues_high: number;
    instructions: number;
    incidents: number;
    near_misses: number;
    equipment_hours: number;
    open_returns: number;
  };
  included_report_versions: { report_id: string; version_no: number }[];
  narrative_final: string | null;
  published_at: string | null;
}

/** Activity offered in the form: a planned wbs_task within the unit's scope. */
export interface FormActivity {
  task_id: string;
  task_code: string;
  task_name: string;
  wbs_node_id: string | null;
  discipline: string | null;
  current_progress: number;
  start_date: string | null;
  end_date: string | null;
  quantity_unit: string | null;
  suggested_trade: string | null;
  steps: { id: string; step_no: number; step_name: string; weight: number; progress: number }[];
  /** Scheduled to be in progress on the report date. */
  planned_today: boolean;
}

export interface FormContext {
  unit: ReportingUnit;
  report_date: string;
  schedule: { deadline_time: string; reminder_time: string; late_window_hours: number; timezone: string };
  activities: FormActivity[];
  rules: RuleDefinition[];
  /** Report that already exists for this unit and date, if any. */
  existing: DrReport | null;
  existing_payload: DrPayload | null;
  existing_evidence: DrEvidence[];
  correction: CorrectionRequest | null;
  draft: DrPayload | null;
  /** Yesterday's plan for today, to pre-fill and to compare manpower. */
  previous_next_day: DrPayload["next_day"];
  /** Cumulative % already approved per task, for regression checks. */
  approved_progress: Record<string, number>;
  /** Unit of measure seen on previously approved lines, per task. */
  known_uom: Record<string, string>;
  today_local: string;
}
