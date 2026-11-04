import type { SupabaseClient } from "@supabase/supabase-js";

// E-Leave > Leave History: leave balances and requests per employee.
// Every account sees its own history; owner accounts (L0 Super Admin,
// L1 Managing Director) and admins also see every employee's. The API routes
// enforce this.

export const LEAVE_HISTORY_OWNER_ROLE_CODES = new Set(["L0", "L1"]);
export const LEAVE_HISTORY_ADMIN_ROLE_CODES = new Set(["admin"]);

/** Pure rule for seeing everyone's history: owner (L0/L1 RBAC role) or admin (profiles.role or user_roles.role_code). */
export function canViewLeaveHistory(profileRole: string | null | undefined, roleCodes: readonly string[]): boolean {
  if (profileRole && LEAVE_HISTORY_ADMIN_ROLE_CODES.has(profileRole)) return true;
  return roleCodes.some(
    (code) => LEAVE_HISTORY_OWNER_ROLE_CODES.has(code) || LEAVE_HISTORY_ADMIN_ROLE_CODES.has(code),
  );
}

export async function checkLeaveHistoryAccess(admin: SupabaseClient, userId: string): Promise<boolean> {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    admin.from("profiles").select("role").eq("id", userId).maybeSingle(),
    admin.from("user_roles").select("role_code").eq("user_id", userId),
  ]);
  const roleCodes = ((roles ?? []) as { role_code: string | null }[])
    .map((r) => r.role_code)
    .filter((c): c is string => c != null);
  return canViewLeaveHistory((profile as { role?: string | null } | null)?.role, roleCodes);
}

export interface LeaveHistoryEmployee {
  id: string;
  employee_code: string | null;
  full_name: string;
  department: string | null;
  job_title: string | null;
  status: string | null;
  /** Totals for the requested year (by leave start date). */
  approved_days: number;
  pending_count: number;
  request_count: number;
}

/** All active employees, or only `onlyEmployeeId` when given. */
export async function listLeaveHistoryEmployees(
  admin: SupabaseClient,
  year: number,
  onlyEmployeeId?: string,
): Promise<LeaveHistoryEmployee[]> {
  let profileQuery = admin
    .from("profiles")
    .select("id, employee_id, full_name, department, job_title, status")
    .order("full_name");
  let requestQuery = admin
    .from("leave_requests")
    .select("employee_id, status, days_requested")
    .gte("start_date", `${year}-01-01`)
    .lte("start_date", `${year}-12-31`);
  if (onlyEmployeeId) {
    profileQuery = profileQuery.eq("id", onlyEmployeeId);
    requestQuery = requestQuery.eq("employee_id", onlyEmployeeId);
  } else {
    profileQuery = profileQuery.neq("status", "archived");
  }
  const [profileRes, requestRes] = await Promise.all([profileQuery, requestQuery]);
  if (profileRes.error) throw new Error(profileRes.error.message);
  if (requestRes.error) throw new Error(requestRes.error.message);

  const totals = new Map<string, { approved_days: number; pending_count: number; request_count: number }>();
  for (const r of (requestRes.data ?? []) as { employee_id: string; status: string; days_requested: number }[]) {
    const t = totals.get(r.employee_id) ?? { approved_days: 0, pending_count: 0, request_count: 0 };
    t.request_count += 1;
    if (r.status === "approved") t.approved_days += Number(r.days_requested);
    if (r.status === "submitted" || r.status === "pending_cancellation") t.pending_count += 1;
    totals.set(r.employee_id, t);
  }

  return ((profileRes.data ?? []) as Array<{
    id: string;
    employee_id: string | null;
    full_name: string | null;
    department: string | null;
    job_title: string | null;
    status: string | null;
  }>).map((p) => ({
    id: p.id,
    employee_code: p.employee_id,
    full_name: p.full_name ?? "Unnamed",
    department: p.department,
    job_title: p.job_title,
    status: p.status,
    ...(totals.get(p.id) ?? { approved_days: 0, pending_count: 0, request_count: 0 }),
  }));
}

export interface LeaveHistoryBalance {
  id: string;
  fiscal_year: number;
  leave_name: string;
  allocated_days: number;
  used_days: number;
  carried_over_days: number;
  remaining_days: number;
  carryover_forfeited: boolean;
}

export interface LeaveHistoryRequest {
  id: string;
  leave_name: string;
  leave_color: string | null;
  start_date: string;
  end_date: string;
  days_requested: number;
  is_half_day: boolean;
  half_day_period: string | null;
  status: string;
  reason: string | null;
  submission_date: string | null;
  created_at: string;
  approver_1_name: string | null;
  approver_1_status: string | null;
  approver_1_date: string | null;
  approver_2_name: string | null;
  approver_2_status: string | null;
  approver_2_date: string | null;
  cancellation_reason: string | null;
}

export interface EmployeeLeaveHistory {
  balances: LeaveHistoryBalance[];
  requests: LeaveHistoryRequest[];
}

type Named = { full_name: string | null } | null;

export async function getEmployeeLeaveHistory(admin: SupabaseClient, employeeId: string): Promise<EmployeeLeaveHistory> {
  const [balanceRes, requestRes] = await Promise.all([
    admin
      .from("leave_balances")
      .select("id, fiscal_year, allocated_days, used_days, carried_over_days, remaining_days, carryover_forfeited, leave_types(leave_name)")
      .eq("employee_id", employeeId)
      .order("fiscal_year", { ascending: false }),
    admin
      .from("leave_requests")
      .select(
        "id, start_date, end_date, days_requested, is_half_day, half_day_period, status, reason, submission_date, created_at, " +
          "approver_1_status, approver_1_date, approver_2_status, approver_2_date, cancellation_reason, " +
          "leave_types(leave_name, color), " +
          "approver_1:profiles!leave_requests_approver_1_id_fkey(full_name), " +
          "approver_2:profiles!leave_requests_approver_2_id_fkey(full_name)",
      )
      .eq("employee_id", employeeId)
      .order("start_date", { ascending: false }),
  ]);
  if (balanceRes.error) throw new Error(balanceRes.error.message);
  if (requestRes.error) throw new Error(requestRes.error.message);

  const balances = ((balanceRes.data ?? []) as unknown as Array<
    Omit<LeaveHistoryBalance, "leave_name"> & { leave_types: { leave_name: string } | null }
  >)
    .map(({ leave_types, ...row }) => ({ ...row, leave_name: leave_types?.leave_name ?? "Unknown" }))
    .sort((a, b) => b.fiscal_year - a.fiscal_year || a.leave_name.localeCompare(b.leave_name));

  const requests = ((requestRes.data ?? []) as unknown as Array<
    Omit<LeaveHistoryRequest, "leave_name" | "leave_color" | "approver_1_name" | "approver_2_name"> & {
      leave_types: { leave_name: string; color: string | null } | null;
      approver_1: Named;
      approver_2: Named;
    }
  >).map(({ leave_types, approver_1, approver_2, ...row }) => ({
    ...row,
    leave_name: leave_types?.leave_name ?? "Unknown",
    leave_color: leave_types?.color ?? null,
    approver_1_name: approver_1?.full_name ?? null,
    approver_2_name: approver_2?.full_name ?? null,
  }));

  return { balances, requests };
}
