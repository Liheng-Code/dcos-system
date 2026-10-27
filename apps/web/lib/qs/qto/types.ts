// Row types for take-off sessions (tables from 20261027131621_qs_qto_sessions.sql).
import type { QuantityStatus, VersionStatus } from "./workflow";

export interface QtoSession {
  id: string;
  tenant_id: string | null;
  tender_id: string;
  project_id: string | null;
  session_code: string;
  name: string;
  description: string | null;
  purpose: "TENDER" | "CONSTRUCTION";
  trade: string | null;
  building: string | null;
  scope: string | null;
  responsible_qs: string | null;
  current_version_id: string | null;
  is_deleted: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QtoSessionVersion {
  id: string;
  session_id: string;
  version_no: number;
  parent_version_id: string | null;
  baseline_version_id: string | null;
  reason: string | null;
  drawing_revision_id: string | null;
  ruleset_version_id: string | null;
  engine_version: string | null;
  status: VersionStatus;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  published_by: string | null;
  published_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** The fields of qto_items that sessions use (a superset lives in qto-service's QtoItem). */
export interface TakeoffItem {
  id: string;
  tender_id: string;
  session_version_id: string | null;
  qto_no: string;
  item_code: string | null;
  description: string;
  unit: string;
  quantity: number | string;
  gross_qty: number | string | null;
  deduction_qty: number | string | null;
  factor_product: number | string | null;
  quantity_status: QuantityStatus;
  exclusion_reason: string | null;
  provisional_assumption: string | null;
  building: string | null;
  level: string | null;
  zone: string | null;
  discipline: string | null;
  work_section: string | null;
  element: string | null;
  wbs_node_id: string | null;
  budget_code_id: string | null;
  rule_code: string | null;
  drawing_id: string | null;
  drawing_revision_id: string | null;
  page_no: number | null;
  grid_location: string | null;
  carried_from_item_id: string | null;
  carry_status: "REMEASURED" | "REVALIDATED" | "UNVERIFIED" | null;
  remarks: string | null;
  /** How the item is drawn on the sheet (viewer only). */
  display_color: string | null;
  display_opacity: number | string | null;
  is_deleted: boolean;
  prepared_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QtoItemFactor {
  id: string;
  item_id: string;
  factor_name: string;
  factor_value: number | string;
  sequence: number;
  reason: string | null;
}

export interface QtoCalculationRunRow {
  id: string;
  item_id: string;
  version_id: string | null;
  rule_code: string | null;
  engine_version: string;
  expression: string | null;
  inputs: unknown;
  gross: number | string;
  deductions: number | string;
  net: number | string;
  factor_product: number | string;
  result: number | string;
  unit: string;
  rounding: unknown;
  created_by: string | null;
  created_at: string;
}

export type IssueSeverity = "BLOCKING" | "WARNING";

export interface QtoIssue {
  id: string;
  version_id: string;
  item_id: string | null;
  rule_code: string;
  severity: IssueSeverity;
  message: string;
  evidence: unknown;
  fingerprint: string;
  status: "open" | "acknowledged" | "resolved";
  justification: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QtoVersionReview {
  id: string;
  version_id: string;
  actor_id: string | null;
  from_status: string | null;
  to_status: string;
  comment: string | null;
  created_at: string;
}

export interface QtoPublication {
  id: string;
  version_id: string;
  session_id: string;
  snapshot: QtoSnapshot;
  snapshot_hash: string;
  item_count: number;
  published_by: string | null;
  published_at: string;
}

export interface QtoSnapshotItem {
  id: string;
  qto_no: string;
  item_code: string | null;
  description: string;
  unit: string;
  quantity: number;
  gross_qty: number | null;
  deduction_qty: number | null;
  factor_product: number | null;
  quantity_status: QuantityStatus;
  exclusion_reason: string | null;
  provisional_assumption: string | null;
  building: string | null;
  level: string | null;
  zone: string | null;
  discipline: string | null;
  work_section: string | null;
  element: string | null;
  wbs_node_id: string | null;
  budget_code_id: string | null;
  rule_code: string | null;
  drawing_revision_id: string | null;
  page_no: number | null;
  grid_location: string | null;
  carried_from_item_id: string | null;
  carry_status: string | null;
  prepared_by: string | null;
  factors: { name: string; value: number }[];
  calculation: {
    run_id: string;
    engine_version: string;
    expression: string | null;
    gross: number;
    deductions: number;
    net: number;
    factor_product: number;
    result: number;
  } | null;
  boq_item_ids: string[];
}

export interface QtoSnapshot {
  schema: string;
  session: { id: string; code: string; name: string; purpose: string; tender_id: string; project_id: string | null; trade: string | null; building: string | null };
  version: { id: string; no: number; parent_version_id: string | null; baseline_version_id: string | null; reason: string | null; engine_version: string | null; submitted_by: string | null; approved_by: string | null; approved_at: string | null };
  source: { drawing_revision_id: string | null; drawing_id: string | null; drawing_no: string | null; revision: string | null; document_revision_id: string | null };
  ruleset: { version_id: string | null; ruleset_code: string | null; version_no: number | null };
  items: QtoSnapshotItem[];
}

export interface QtoTransferLine {
  boq_item_id: string;
  action: "created" | "updated" | "unchanged";
  previous_qty: number | null;
  new_qty: number;
  item_ids: string[];
}

export interface QtoTransfer {
  id: string;
  publication_id: string;
  target: "tender_boq";
  target_tender_id: string;
  idempotency_key: string;
  include_provisional: boolean;
  allow_overwrite: boolean;
  status: "succeeded" | "failed";
  lines: QtoTransferLine[];
  error: string | null;
  created_by: string | null;
  created_at: string;
  replayed?: boolean;
}

export interface RuleDefinition {
  code: string;
  name: string;
  trade?: string | null;
  unit: string | null;
  formula: string | null;
  inputs: { name: string; unit: string }[];
  deduction_policy?: string | null;
  allowed_factors?: string[];
}

export interface RulesetDefinition {
  rounding: { stage: "net" | "final" | "none"; dp: number; mode: "half_up" | "up" | "down" };
  validations?: { max_variance_pct?: number; max_dimension_m?: number };
  factors: { name: string; min: number; max: number }[];
  rules: RuleDefinition[];
}

export interface QtoRuleset {
  id: string;
  tenant_id: string | null;
  code: string;
  name: string;
  description: string | null;
  standard: string | null;
  is_active: boolean;
}

export interface QtoRuleVersion {
  id: string;
  ruleset_id: string;
  version_no: number;
  status: "draft" | "approved" | "retired";
  definition: RulesetDefinition;
  change_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface QtoCalibration {
  id: string;
  drawing_revision_id: string;
  page_no: number;
  points: { x: number; y: number }[];
  pixel_distance: number | string;
  known_distance: number | string;
  known_unit: "mm" | "cm" | "m";
  metres_per_unit: number | string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}
