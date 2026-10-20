// Phase 3.0 editors: writes behind the Activity page / Template editor forms.
// Writes are limited to DRAFT masters and templates by database triggers (migration 20261006000007), so these
// functions stay thin. Kept apart from library-service.ts (reads, lifecycle, generation helpers).

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ActMaster, AllocationRule, ApplicabilityRow, ApplicabilityRule, FactorType, QuantityProviderKey, Relation,
  RequirementKind, ResourceKind,
} from "./types";

type Db = SupabaseClient;

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function listApplicabilityRows(db: Db, targetType: "master" | "template", targetId: string): Promise<ApplicabilityRow[]> {
  const { data, error } = await db.from("plan_act_applicability").select("id, attribute, operator, values")
    .eq("target_type", targetType).eq("target_id", targetId);
  fail(error);
  return (data ?? []) as ApplicabilityRow[];
}

export async function addApplicability(db: Db, targetType: "master" | "template", targetId: string, rule: ApplicabilityRule): Promise<void> {
  const { error } = await db.from("plan_act_applicability").insert({ target_type: targetType, target_id: targetId, ...rule });
  fail(error);
}

export async function deleteApplicability(db: Db, id: string): Promise<void> {
  fail((await db.from("plan_act_applicability").delete().eq("id", id)).error);
}

export interface QuantityRuleInput {
  id?: string;
  master_id: string;
  name: string;
  metric_code: string;
  unit: string | null;
  provider_priority: QuantityProviderKey[];
  deduction_metrics: string[];
  addition_metrics: string[];
  note: string | null;
}

export async function saveQuantityRule(db: Db, r: QuantityRuleInput): Promise<void> {
  const { error } = r.id
    ? await db.from("plan_act_quantity_rules").update(r).eq("id", r.id)
    : await db.from("plan_act_quantity_rules").insert(r);
  fail(error);
}

export async function deleteQuantityRule(db: Db, id: string): Promise<void> {
  fail((await db.from("plan_act_quantity_rules").delete().eq("id", id)).error);
}

export async function addLogicRule(
  db: Db,
  r: { predecessor_master_id: string; successor_master_id: string; relation: Relation; lag_days: number; is_optional: boolean; note: string | null },
): Promise<void> {
  fail((await db.from("plan_act_logic_rules").insert(r)).error);
}

export async function deleteLogicRule(db: Db, id: string): Promise<void> {
  fail((await db.from("plan_act_logic_rules").delete().eq("id", id)).error);
}

export async function addRequirement(
  db: Db,
  r: { master_id: string; kind: RequirementKind; title: string; is_mandatory: boolean; reference_code: string | null; doc_type: string | null; sort_order: number },
): Promise<void> {
  fail((await db.from("plan_act_requirements").insert(r)).error);
}

export async function deleteRequirement(db: Db, id: string): Promise<void> {
  fail((await db.from("plan_act_requirements").delete().eq("id", id)).error);
}

export async function addFactor(
  db: Db, normId: string, f: { factor_type: FactorType; label: string; value: number; condition_note: string | null },
): Promise<void> {
  fail((await db.from("plan_act_productivity_factors").insert({ norm_id: normId, sort_order: 50, ...f })).error);
}

export async function deleteFactor(db: Db, id: string): Promise<void> {
  fail((await db.from("plan_act_productivity_factors").delete().eq("id", id)).error);
}

export interface CrewLineInput {
  kind: ResourceKind;
  role_label: string;
  workers_per_crew: number;
  allocation_rule: AllocationRule;
  is_optional: boolean;
}

/**
 * New company-level DRAFT productivity standard linked to a master (and optional method). The labour constant is derived
 * from the per-crew labour lines and the direct output so the existing engine (Task Work, costing) can use it unchanged.
 * Approval stays with the norms approval permission (Norm Library).
 */
export async function createProductivityStandard(
  db: Db,
  input: {
    master: Pick<ActMaster, "id" | "code" | "default_unit" | "discipline">;
    method_id: string | null;
    method_code: string | null;
    name: string;
    output_per_day: number;
    hours_per_day: number;
    basis_note: string;
    crew: CrewLineInput[];
  },
): Promise<string> {
  const unit = input.master.default_unit;
  if (!unit) throw new Error("The activity needs a default unit before a productivity standard can be created");
  if (!(input.output_per_day > 0)) throw new Error("Output per day must be greater than zero");
  if (!input.basis_note.trim()) throw new Error("A basis note is required (where does this figure come from?)");
  const crewWorkers = input.crew
    .filter((c) => c.kind === "labor" && c.allocation_rule === "per_crew")
    .reduce((a, c) => a + c.workers_per_crew, 0);
  if (!(crewWorkers > 0)) throw new Error("Add at least one labour line that is allocated per crew");
  const labourConstant = Math.round(((crewWorkers * input.hours_per_day) / input.output_per_day) * 1000) / 1000;
  const code = `ACT-${input.master.code}${input.method_code ? "-" + input.method_code : ""}`;
  const { data, error } = await db.from("plan_productivity_norms").insert({
    project_id: null, code, name: input.name.trim(), trade: input.master.discipline, discipline: input.master.discipline,
    activity_key: input.master.code, unit, labour_constant_hr_per_unit: labourConstant, hours_per_day_basis: input.hours_per_day,
    source: "manual", basis_note: input.basis_note.trim(), status: "draft",
    activity_master_id: input.master.id, method_id: input.method_id, output_per_day: input.output_per_day,
  }).select("id").single();
  if (error) {
    throw new Error(/row-level security/i.test(error.message) ? "You do not have permission to create company productivity standards (planning/norms)." : error.message);
  }
  const normId = (data as { id: string }).id;
  const rows = input.crew.map((c, i) => ({
    norm_id: normId, kind: c.kind, role_label: c.role_label.trim(), workers_per_crew: c.workers_per_crew,
    hours_per_day: input.hours_per_day, sort_order: i + 1, allocation_rule: c.allocation_rule, is_optional: c.is_optional,
  }));
  fail((await db.from("plan_productivity_norm_resources").insert(rows)).error);
  return normId;
}
