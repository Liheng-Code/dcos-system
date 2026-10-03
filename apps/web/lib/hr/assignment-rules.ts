// Pure logic for HR assignment rules: which rule applies to an employee, and what
// records provisioning would create from it. No database access here; the service
// (provisioning.ts) loads the inputs and writes the plan.

export interface AssignmentRule {
  id: string;
  name: string;
  priority: number;
  is_active: boolean;
  m_employment_type: string | null;
  m_employment_category: string | null;
  m_labor_category: string | null;
  m_department_id: string | null;
  m_position_id: string | null;
  m_company_id: string | null;
  leave_group: string | null;
  payroll_group: string | null;
  shift_id: string | null;
  default_site_id: string | null;
  ot_eligible: boolean | null;
  tax_applicable: boolean | null;
  nssf_applicable: boolean | null;
  payroll_type: string | null;
  currency: "USD" | "KHR" | null;
  note: string | null;
}

export interface ProvisionProfile {
  id: string;
  full_name: string | null;
  employee_id: string | null;
  employment_type: string | null;
  employment_category: string | null;
  labor_category: string | null;
  department_id: string | null;
  position_id: string | null;
  company_id: string | null;
  leave_group: string | null;
  payroll_group: string | null;
  report_to: string | null;
}

/** What the employee already has. Anything present is left alone. */
export interface ExistingState {
  hasPayrollProfile: boolean;
  hasTaxProfile: boolean;
  hasNssfProfile: boolean;
  hasShiftAssignment: boolean;
  hasSiteAssignment: boolean;
  hasReportingLine: boolean;
}

export type ProvisionAction =
  | { kind: "profile_fields"; values: { leave_group?: string; payroll_group?: string } }
  | { kind: "payroll_profile"; values: Record<string, unknown> }
  | { kind: "tax_profile"; values: Record<string, unknown> }
  | { kind: "nssf_profile"; values: Record<string, unknown> }
  | { kind: "shift_assignment"; values: { shift_id: string } }
  | { kind: "site_assignment"; values: { site_id: string } }
  | { kind: "reporting_line"; values: { manager_id: string } };

export interface ProvisionPlan {
  employeeId: string;
  rule: { id: string; name: string } | null;
  actions: ProvisionAction[];
  /** Why nothing (or only part) was provisioned: shown to HR in the preview. */
  issues: string[];
}

const MATCH_FIELDS = [
  ["m_employment_type", "employment_type"],
  ["m_employment_category", "employment_category"],
  ["m_labor_category", "labor_category"],
  ["m_department_id", "department_id"],
  ["m_position_id", "position_id"],
  ["m_company_id", "company_id"],
] as const;

function specificity(rule: AssignmentRule): number {
  return MATCH_FIELDS.filter(([m]) => rule[m] != null).length;
}

/**
 * The rule that applies: every non-null match column must equal the profile's value.
 * Lowest priority number wins; between equal priorities the more specific rule wins,
 * then the name, so the result is stable.
 */
export function matchRule(profile: ProvisionProfile, rules: AssignmentRule[]): AssignmentRule | null {
  const matching = rules.filter(
    (rule) => rule.is_active && MATCH_FIELDS.every(([m, p]) => rule[m] == null || rule[m] === profile[p]),
  );
  matching.sort(
    (a, b) => a.priority - b.priority || specificity(b) - specificity(a) || a.name.localeCompare(b.name),
  );
  return matching[0] ?? null;
}

/** Fields a profile must have for any rule to be able to match it, for the preview. */
export function missingMatchFields(profile: ProvisionProfile): string[] {
  return MATCH_FIELDS.map(([, p]) => p).filter((p) => profile[p] == null);
}

/**
 * What provisioning would create for one employee. Existing records are never
 * replaced; a profile group already set by HR is never overwritten.
 */
export function planProvision(
  profile: ProvisionProfile,
  rules: AssignmentRule[],
  existing: ExistingState,
): ProvisionPlan {
  const rule = matchRule(profile, rules);
  const plan: ProvisionPlan = {
    employeeId: profile.id,
    rule: rule ? { id: rule.id, name: rule.name } : null,
    actions: [],
    issues: [],
  };

  const fields: { leave_group?: string; payroll_group?: string } = {};
  if (rule) {
    if (rule.leave_group && !profile.leave_group) fields.leave_group = rule.leave_group;
    if (rule.payroll_group && !profile.payroll_group) fields.payroll_group = rule.payroll_group;
  }
  if (Object.keys(fields).length > 0) plan.actions.push({ kind: "profile_fields", values: fields });

  // Reporting line comes from the master (report_to), independent of any rule.
  if (!existing.hasReportingLine && profile.report_to && profile.report_to !== profile.id) {
    plan.actions.push({ kind: "reporting_line", values: { manager_id: profile.report_to } });
  } else if (!existing.hasReportingLine && !profile.report_to) {
    plan.issues.push("No reporting manager set in Employee Master");
  }

  if (!rule) {
    const missing = missingMatchFields(profile);
    plan.issues.push(
      missing.length > 0
        ? `No assignment rule matched; Employee Master is missing ${missing.join(", ")}`
        : "No assignment rule matched",
    );
    return plan;
  }

  if (!existing.hasPayrollProfile) {
    const group = profile.payroll_group ?? rule.payroll_group;
    if (rule.payroll_type && rule.currency && group) {
      plan.actions.push({
        kind: "payroll_profile",
        values: {
          payroll_type: rule.payroll_type,
          currency: rule.currency,
          payroll_group: group,
          ot_eligible: rule.ot_eligible ?? false,
          tax_applicable: rule.tax_applicable ?? true,
          nssf_applicable: rule.nssf_applicable ?? true,
        },
      });
    } else {
      plan.issues.push(`Rule "${rule.name}" has no payroll type, currency and payroll group, so no payroll profile`);
    }
  }
  if (!existing.hasTaxProfile) {
    // Residency, marital status and dependants are personal facts: table defaults apply
    // (resident, single, none) and HR corrects them per employee.
    plan.actions.push({ kind: "tax_profile", values: {} });
  }
  if (!existing.hasNssfProfile && rule.nssf_applicable != null) {
    plan.actions.push({ kind: "nssf_profile", values: { nssf_applicable: rule.nssf_applicable } });
  }
  if (!existing.hasShiftAssignment) {
    if (rule.shift_id) plan.actions.push({ kind: "shift_assignment", values: { shift_id: rule.shift_id } });
    else plan.issues.push(`Rule "${rule.name}" has no shift`);
  }
  if (!existing.hasSiteAssignment && rule.default_site_id) {
    plan.actions.push({ kind: "site_assignment", values: { site_id: rule.default_site_id } });
  }
  return plan;
}
