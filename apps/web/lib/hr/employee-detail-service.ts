// Data access for the Employee Master detail page: every query, write and API
// call the page makes goes through here.

import { createClient } from "@/lib/supabase/client";
import type {
  AssignmentQueryRow,
  AssignmentRow,
  BankAccount,
  ChecklistStatusRow,
  EmployeeDocumentRow,
  NSSFProfile,
  PayrollProfile,
  PayslipRow,
  Profile,
  Role,
  SalaryLine,
  TaxProfile,
} from "@/lib/hr/employee-detail-types";

export interface EmployeeDetailData {
  profile: Profile;
  allProfiles: { id: string; full_name: string }[];
  // Null when the employee has no saved record of that kind yet.
  payrollProfile: PayrollProfile | null;
  taxProfile: TaxProfile | null;
  nssfProfile: NSSFProfile | null;
  bankAccount: BankAccount | null;
  salaryLines: SalaryLine[];
  payslips: PayslipRow[];
  employeeDocuments: EmployeeDocumentRow[];
  checklistStatuses: ChecklistStatusRow[];
  projectAssignments: AssignmentRow[];
}

// Tables holding one editable record per employee, saved by update-or-insert.
export type EmployeeRecordTable =
  | "employee_payroll_profiles"
  | "employee_tax_profiles"
  | "employee_nssf_profiles"
  | "employee_bank_accounts";

/** Everything the detail page shows on first load. Null if the employee cannot be read. */
export async function loadEmployeeDetail(id: string): Promise<EmployeeDetailData | null> {
  const supabase = createClient();

  const [pRes, allRes, ppRes, tpRes, npRes, baRes, ssRes, psRes, docRes, checklistRes, assignmentRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).single(),
    supabase.from("profiles").select("id, full_name").order("full_name"),
    supabase.from("employee_payroll_profiles").select("*").eq("employee_id", id).order("effective_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("employee_tax_profiles").select("*").eq("employee_id", id).order("effective_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("employee_nssf_profiles").select("*").eq("employee_id", id).order("effective_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("employee_bank_accounts").select("*").eq("employee_id", id).eq("is_primary", true).maybeSingle(),
    supabase.from("employee_salary_structures")
      .select("id, amount, effective_from, effective_to, payroll_component_types(name)")
      .eq("employee_id", id)
      .order("effective_from", { ascending: false }),
    supabase.from("payroll_entries")
      .select("id, gross_salary, total_deductions, net_salary, status, payroll_periods(label, period_year, period_month)")
      .eq("employee_id", id)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase.from("employee_documents")
      .select("id, document_type, document_name, expiry_date, verified")
      .eq("employee_id", id)
      .order("document_type"),
    supabase.from("employee_document_checklist_status")
      .select("id, status, waived_reason, document_id, employee_document_checklist_items(label, document_type, is_mandatory)")
      .eq("employee_id", id),
    supabase.from("employee_project_assignments")
      .select("id, project_id, role_in_project, allocation_percent, start_date, end_date, status, projects(project_name, project_code)")
      .eq("employee_id", id)
      .order("start_date", { ascending: false }),
  ]);

  if (pRes.error || !pRes.data) return null;

  let payrollProfile: PayrollProfile | null = null;
  if (ppRes.data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = ppRes.data as any;
    payrollProfile = { id: d.id, payroll_type: d.payroll_type, currency: d.currency, payroll_group: d.payroll_group, ot_eligible: d.ot_eligible, tax_applicable: d.tax_applicable, nssf_applicable: d.nssf_applicable, effective_date: d.effective_date };
  }

  let taxProfile: TaxProfile | null = null;
  if (tpRes.data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = tpRes.data as any;
    taxProfile = { id: d.id, tax_residency: d.tax_residency, marital_status: d.marital_status, spouse_dependent: d.spouse_dependent, num_children: d.num_children, tax_id: d.tax_id ?? "", effective_date: d.effective_date };
  }

  let nssfProfile: NSSFProfile | null = null;
  if (npRes.data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = npRes.data as any;
    nssfProfile = { id: d.id, nssf_applicable: d.nssf_applicable, nssf_number: d.nssf_number ?? "", pension_applicable: d.pension_applicable, healthcare_applicable: d.healthcare_applicable, occupational_risk_applicable: d.occupational_risk_applicable, effective_date: d.effective_date };
  }

  let bankAccount: BankAccount | null = null;
  if (baRes.data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = baRes.data as any;
    bankAccount = { id: d.id, bank_name: d.bank_name, account_name: d.account_name, account_number: d.account_number, branch: d.branch ?? "", is_primary: d.is_primary, payment_method: "bank_transfer" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const salaryLines: SalaryLine[] = ((ssRes.data ?? []) as any[]).map((s) => ({
    id: s.id,
    component: s.payroll_component_types?.name ?? "—",
    amount: Number(s.amount),
    effective_from: s.effective_from,
    effective_to: s.effective_to,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payslips: PayslipRow[] = ((psRes.data ?? []) as any[]).map((e) => ({
    id: e.id,
    period: e.payroll_periods?.label ?? `${e.payroll_periods?.period_year}-${String(e.payroll_periods?.period_month).padStart(2, "0")}`,
    gross: Number(e.gross_salary),
    deductions: Number(e.total_deductions),
    net: Number(e.net_salary),
    status: e.status,
  }));

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    profile: pRes.data as any,
    allProfiles: (allRes.data ?? []) as { id: string; full_name: string }[],
    payrollProfile,
    taxProfile,
    nssfProfile,
    bankAccount,
    salaryLines,
    payslips,
    employeeDocuments: (docRes.data ?? []) as EmployeeDocumentRow[],
    checklistStatuses: (checklistRes.data ?? []) as ChecklistStatusRow[],
    projectAssignments: ((assignmentRes.data ?? []) as AssignmentQueryRow[]).map((row) => ({
      ...row,
      allocation_percent: Number(row.allocation_percent),
    })) as AssignmentRow[],
  };
}

export async function fetchEmployeeProfile(id: string): Promise<Profile | null> {
  const { data } = await createClient().from("profiles").select("*").eq("id", id).single();
  return (data as Profile | null) ?? null;
}

/** Direct update of profile columns. Returns the error message, or null on success. */
export async function updateEmployeeProfile(id: string, fields: Record<string, unknown>): Promise<string | null> {
  const { error } = await createClient().from("profiles").update(fields).eq("id", id);
  return error ? error.message : null;
}

/** Marks probation completed, confirmed today by the signed-in user. */
export async function confirmEmployeeProbation(id: string): Promise<{ error: string | null; confirmationDate: string }> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const confirmationDate = new Date().toISOString().split("T")[0];
  const { error } = await supabase.from("profiles").update({
    probation_status: "completed",
    confirmation_date: confirmationDate,
    confirmed_by: userData?.user?.id ?? null,
  }).eq("id", id);
  return { error: error ? error.message : null, confirmationDate };
}

/**
 * Updates the record when recordId is given, otherwise inserts it.
 * insertedId is set only when a new row was created.
 */
export async function saveEmployeeRecord(
  table: EmployeeRecordTable,
  recordId: string | undefined,
  payload: Record<string, unknown>,
): Promise<{ error: string | null; insertedId?: string }> {
  const supabase = createClient();
  if (recordId) {
    const { error } = await supabase.from(table).update(payload).eq("id", recordId);
    return { error: error ? error.message : null };
  }
  const res = await supabase.from(table).insert(payload).select("id").single();
  return { error: res.error ? res.error.message : null, insertedId: res.data?.id };
}

export async function fetchRoles(): Promise<Role[] | null> {
  const { data } = await createClient().from("roles").select("code, name, type").order("name");
  return data ? (data as Role[]) : null;
}

export async function fetchUserRoleCodes(userId: string): Promise<string[] | null> {
  const { data } = await createClient().from("user_roles").select("role_code").eq("user_id", userId);
  return data ? data.map((r: { role_code: string }) => r.role_code) : null;
}

/** Makes the user's RBAC role assignments match assignedRoles; reports what changed. */
export async function syncUserRoles(userId: string, assignedRoles: string[]): Promise<{ toAdd: string[]; toRemove: string[] }> {
  const supabase = createClient();
  const { data: existing } = await supabase.from("user_roles").select("role_code").eq("user_id", userId);
  const existingCodes = (existing ?? []).map((r: { role_code: string }) => r.role_code);
  const toAdd = assignedRoles.filter((c) => !existingCodes.includes(c));
  const toRemove = existingCodes.filter((c: string) => !assignedRoles.includes(c));
  if (toRemove.length > 0) await supabase.from("user_roles").delete().eq("user_id", userId).in("role_code", toRemove);
  if (toAdd.length > 0) await supabase.from("user_roles").insert(toAdd.map((code) => ({ user_id: userId, role_code: code })));
  return { toAdd, toRemove };
}

// ── /api/hr/employees/[id] ───────────────────────────────────────────────────

/** GET: audit logs and HR history. PATCH: audited master-data update. POST: lifecycle action or audit event. */
export function employeeApi(id: string, method: "GET" | "PATCH" | "POST" = "GET", body?: unknown): Promise<Response> {
  if (method === "GET") return fetch(`/api/hr/employees/${id}`);
  return fetch(`/api/hr/employees/${id}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
