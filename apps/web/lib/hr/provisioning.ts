// Server-side provisioning: loads employees, rules and what each employee already has,
// builds the plan (assignment-rules.ts), and writes it. Use with the admin client.

import type { createAdminClient } from "@/lib/supabase/server";
import {
  planProvision,
  type AssignmentRule,
  type ExistingState,
  type ProvisionAction,
  type ProvisionPlan,
  type ProvisionProfile,
} from "./assignment-rules";

type Admin = ReturnType<typeof createAdminClient>;

const PROFILE_COLUMNS =
  "id, full_name, employee_id, employment_type, employment_category, labor_category, department_id, position_id, company_id, leave_group, payroll_group, report_to";

export interface ProvisionPreviewRow extends ProvisionPlan {
  fullName: string | null;
  employeeCode: string | null;
}

export interface ProvisionApplyResult {
  employees: number;
  created: Record<ProvisionAction["kind"], number>;
  errors: { employeeId: string; kind: string; message: string }[];
}

const today = () => new Date().toISOString().slice(0, 10);

// "current": no end date or ends today or later; "open": no end date.
async function idSet(supabase: Admin, table: string, ids: string[], mode?: "current" | "open"): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const base = supabase.from(table).select("employee_id").in("employee_id", ids);
  const query = mode === "open" ? base.is("effective_to", null) : mode === "current" ? base.or(`effective_to.is.null,effective_to.gte.${today()}`) : base;
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return new Set((data ?? []).map((r: { employee_id: string }) => r.employee_id));
}

/** Plans for every active employee, or only the listed ones. Writes nothing. */
export async function buildProvisionPreview(supabase: Admin, employeeIds?: string[]): Promise<ProvisionPreviewRow[]> {
  let profileQuery = supabase.from("profiles").select(PROFILE_COLUMNS).eq("status", "active").order("full_name");
  if (employeeIds && employeeIds.length > 0) profileQuery = profileQuery.in("id", employeeIds);
  const [{ data: profiles, error: pErr }, { data: rules, error: rErr }] = await Promise.all([
    profileQuery,
    supabase.from("hr_assignment_rules").select("*").eq("is_active", true),
  ]);
  if (pErr) throw new Error(`profiles: ${pErr.message}`);
  if (rErr) throw new Error(`hr_assignment_rules: ${rErr.message}`);

  const list = (profiles ?? []) as (ProvisionProfile & { full_name: string | null })[];
  const ids = list.map((p) => p.id);

  const [payroll, tax, nssf, shift, site, reporting] = await Promise.all([
    idSet(supabase, "employee_payroll_profiles", ids),
    idSet(supabase, "employee_tax_profiles", ids),
    idSet(supabase, "employee_nssf_profiles", ids),
    idSet(supabase, "employee_shift_assignments", ids, "current"),
    idSet(supabase, "employee_attendance_site_assignments", ids, "current"),
    idSet(supabase, "reporting_structure", ids, "open"),
  ]);

  return list.map((profile) => {
    const existing: ExistingState = {
      hasPayrollProfile: payroll.has(profile.id),
      hasTaxProfile: tax.has(profile.id),
      hasNssfProfile: nssf.has(profile.id),
      hasShiftAssignment: shift.has(profile.id),
      hasSiteAssignment: site.has(profile.id),
      hasReportingLine: reporting.has(profile.id),
    };
    const plan = planProvision(profile, (rules ?? []) as AssignmentRule[], existing);
    return { ...plan, fullName: profile.full_name, employeeCode: profile.employee_id };
  });
}

async function applyAction(
  supabase: Admin,
  employeeId: string,
  positionId: string | null,
  action: ProvisionAction,
  actorId: string,
): Promise<string | null> {
  const day = today();
  let error: { message: string } | null = null;
  switch (action.kind) {
    case "profile_fields":
      ({ error } = await supabase.from("profiles").update(action.values).eq("id", employeeId));
      break;
    case "payroll_profile":
      ({ error } = await supabase
        .from("employee_payroll_profiles")
        .insert({ employee_id: employeeId, effective_date: day, created_by: actorId, ...action.values }));
      break;
    case "tax_profile":
      ({ error } = await supabase
        .from("employee_tax_profiles")
        .insert({ employee_id: employeeId, effective_date: day, created_by: actorId, ...action.values }));
      break;
    case "nssf_profile":
      ({ error } = await supabase
        .from("employee_nssf_profiles")
        .insert({ employee_id: employeeId, effective_date: day, created_by: actorId, ...action.values }));
      break;
    case "shift_assignment":
      ({ error } = await supabase
        .from("employee_shift_assignments")
        .insert({ employee_id: employeeId, effective_from: day, assigned_by: actorId, source: "rule", ...action.values }));
      break;
    case "site_assignment":
      ({ error } = await supabase
        .from("employee_attendance_site_assignments")
        .insert({ employee_id: employeeId, effective_from: day, assigned_by: actorId, source: "rule", ...action.values }));
      break;
    case "reporting_line":
      ({ error } = await supabase
        .from("reporting_structure")
        .insert({ employee_id: employeeId, position_id: positionId, effective_from: day, ...action.values }));
      break;
  }
  return error ? error.message : null;
}

/** Writes the plans for the given employees. A failed action is reported, the rest still run. */
export async function applyProvision(supabase: Admin, employeeIds: string[], actorId: string): Promise<ProvisionApplyResult> {
  const preview = await buildProvisionPreview(supabase, employeeIds);
  const { data: positions } = await supabase.from("profiles").select("id, position_id").in("id", employeeIds);
  const positionByEmployee = new Map((positions ?? []).map((p: { id: string; position_id: string | null }) => [p.id, p.position_id]));

  const result: ProvisionApplyResult = {
    employees: 0,
    created: { profile_fields: 0, payroll_profile: 0, tax_profile: 0, nssf_profile: 0, shift_assignment: 0, site_assignment: 0, reporting_line: 0 },
    errors: [],
  };
  for (const plan of preview) {
    if (plan.actions.length === 0) continue;
    result.employees++;
    for (const action of plan.actions) {
      const message = await applyAction(supabase, plan.employeeId, positionByEmployee.get(plan.employeeId) ?? null, action, actorId);
      if (message) result.errors.push({ employeeId: plan.employeeId, kind: action.kind, message });
      else result.created[action.kind]++;
    }
  }
  return result;
}
