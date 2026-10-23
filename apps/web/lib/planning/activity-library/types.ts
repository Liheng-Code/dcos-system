// Activity Library domain types (Planning). Tables: plan_act_* (migrations 20261006000001-3).
// Project Activity is the existing wbs_tasks row; nothing here is project-specific.

export type LibraryStatus = "draft" | "under_review" | "approved" | "active" | "superseded" | "archived";

export const LIBRARY_STATUSES: LibraryStatus[] = ["draft", "under_review", "approved", "active", "superseded", "archived"];

/** Legal lifecycle moves, mirrored from the database guard triggers (the database is the authority). */
export const STATUS_TRANSITIONS: Record<LibraryStatus, LibraryStatus[]> = {
  draft: ["under_review", "archived"],
  under_review: ["draft", "approved"],
  approved: ["active", "draft"],
  active: ["superseded", "archived"],
  superseded: ["archived"],
  archived: ["draft"],
};

export type Relation = "fs" | "ss" | "ff" | "sf";

export interface ActDomain { id: string; code: string; name: string; sort_order: number; is_active: boolean }
export interface ActCategory { id: string; domain_id: string; code: string; name: string; sort_order: number; is_active: boolean }
export interface ActFamily { id: string; category_id: string; code: string; name: string; sort_order: number; is_active: boolean }

export interface ActMaster {
  id: string;
  code: string;
  name: string;
  description: string | null;
  domain_id: string;
  category_id: string;
  family_id: string;
  discipline: string | null;
  work_type: string | null;
  default_unit: string | null;
  status: LibraryStatus;
  version: number;
  revision: number;
  supersedes_id: string | null;
  owner: string | null;
  source: string | null;
  /** Sector slugs (projects.category) this master is used in; empty = every sector. */
  sectors: string[];
  /** Building-type slugs (projects.building_type) it is written for. */
  building_types: string[];
  effective_date: string | null;
  superseded_date: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  /** planning attributes (doc 21): not versioned content, editable by library managers on any status */
  duration_basis?: DurationBasis;
  default_work_group?: string | null;
  default_step_template_id?: string | null;
}

/** How an activity's duration is set: from QS quantity x productivity, a standard fixed figure, or the planner. */
export type DurationBasis = "quantity" | "fixed" | "programme";

export interface ActMethod {
  id: string;
  master_id: string;
  code: string;
  name: string;
  description: string | null;
  constraints_note: string | null;
  is_default: boolean;
  sort_order: number;
}

export type FactorType = "height" | "access" | "crew" | "method" | "weather" | "working_hour" | "site_condition" | "other";

export interface ProductivityFactor {
  id?: string;
  factor_type: FactorType;
  label: string | null;
  value: number;
  condition_note: string | null;
}

export type ResourceKind = "labor" | "equipment" | "material" | "subcontract" | "crew";
export type AllocationRule = "per_crew" | "per_activity" | "per_pour" | "quantity_driven" | "fixed";

export interface ActResourceLine {
  id: string;
  kind: ResourceKind;
  role_label: string;
  workers_per_crew: number;
  hours_per_day: number | null;
  allocation_rule: AllocationRule;
  is_optional: boolean;
  sort_order: number;
}

/** A Productivity Standard = a plan_productivity_norms row linked to a master (+ optional method). */
export interface ActProductivityStandard {
  id: string;
  code: string;
  name: string;
  unit: string;
  status: "draft" | "approved" | "retired";
  version: number;
  method_id: string | null;
  output_per_day: number | null;
  labour_constant_hr_per_unit: number;
  hours_per_day_basis: number;
  efficiency_pct: number;
  basis_note: string;
  factors: ProductivityFactor[];
  resources: ActResourceLine[];
}

export type QuantityProviderKey = "bim" | "boq" | "manual" | "calculated" | "module";

export interface ActQuantityRule {
  id: string;
  master_id: string;
  name: string;
  metric_code: string;
  unit: string | null;
  provider_priority: QuantityProviderKey[];
  deduction_metrics: string[];
  addition_metrics: string[];
  note: string | null;
}

export interface ActLogicRule {
  id: string;
  predecessor_master_id: string;
  successor_master_id: string;
  relation: Relation;
  lag_days: number;
  is_optional: boolean;
  note: string | null;
}

export interface ApplicabilityRule {
  attribute: string;
  operator: "eq" | "neq" | "in" | "not_in";
  values: string[];
}

export interface ApplicabilityRow extends ApplicabilityRule { id: string }

export type RequirementKind = "qaqc" | "hse" | "document" | "hold_point" | "milestone";

export interface ActRequirement {
  id: string;
  master_id: string;
  kind: RequirementKind;
  title: string;
  is_mandatory: boolean;
  reference_code: string | null;
  doc_type: string | null;
  sort_order: number;
}

export interface ActTemplate {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: LibraryStatus;
  version: number;
  supersedes_id: string | null;
  applies_to_level_types: string[];
  inter_level_from_seq: number | null;
  inter_level_to_seq: number | null;
  inter_level_relation: Relation;
  inter_level_lag_days: number;
  /** Sector slugs this template is used in; empty = every sector. */
  sectors: string[];
  /** Building-type slugs this template is recommended for. */
  building_types: string[];
  owner: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActTemplateItem {
  id: string;
  template_id: string;
  seq: number;
  master_id: string;
  scope: "floor" | "element" | "zone";
  method_id: string | null;
  norm_id: string | null;
  duration_days_override: number | null;
  /** parallel crews the generated duration is planned with (default 1) */
  crews?: number | null;
  is_milestone: boolean;
  note: string | null;
}

export interface ActTemplateDependency {
  id: string;
  template_id: string;
  predecessor_item_id: string;
  successor_item_id: string;
  relation: Relation;
  lag_days: number;
  is_optional: boolean;
}
