// Data access for the Leave Admin Setup page: every query, write and API call
// the page makes goes through here.

import { createClient } from "@/lib/supabase/client";
import type {
  HolidayForm,
  LeaveType,
  LeaveTypeForm,
  PublicHoliday,
  SeniorityRule,
  TeamCapacity,
  YearEndLog,
} from "@/lib/hr/leave-admin-types";

export interface LeaveAdminConfig {
  leaveTypes: LeaveType[];
  seniorityRules: SeniorityRule[];
  teamCapacity: TeamCapacity[];
  yearEndLogs: YearEndLog[];
  departments: { id: string; department_name: string }[];
}

export async function loadLeaveAdminConfig(): Promise<LeaveAdminConfig> {
  const supabase = createClient();
  const [typesRes, senRes, capRes, logsRes, deptRes] = await Promise.all([
    supabase.from("leave_types").select("*").order("leave_name"),
    supabase.from("leave_seniority_rules").select("*").order("min_years"),
    supabase.from("leave_team_capacity").select("*, departments(department_name)").order("max_percent"),
    supabase.from("leave_year_end_logs").select("*, profiles(full_name)").order("run_date", { ascending: false }).limit(20),
    supabase.from("departments").select("id, department_name").order("department_name"),
  ]);
  return {
    leaveTypes: typesRes.data || [],
    seniorityRules: senRes.data || [],
    teamCapacity: capRes.data || [],
    yearEndLogs: logsRes.data || [],
    departments: deptRes.data || [],
  };
}

// ── Leave types ──────────────────────────────────────────────────────────────

export async function fetchLeaveTypes(): Promise<LeaveType[]> {
  const { data } = await createClient().from("leave_types").select("*").order("leave_name");
  return data || [];
}

/** Updates the leave type when id is given, otherwise creates it. Returns the error message, or null. */
export async function saveLeaveType(id: string | null, form: LeaveTypeForm): Promise<string | null> {
  const supabase = createClient();
  const payload = { ...form, deduct_from_type_id: form.deduct_from_type_id || null };
  const { error } = id
    ? await supabase.from("leave_types").update(payload).eq("id", id)
    : await supabase.from("leave_types").insert(payload);
  return error ? error.message : null;
}

export async function deleteLeaveType(id: string): Promise<string | null> {
  const { error } = await createClient().from("leave_types").delete().eq("id", id);
  return error ? error.message : null;
}

// ── Public holidays ──────────────────────────────────────────────────────────

export async function fetchPublicHolidays(year: number): Promise<PublicHoliday[]> {
  const { data } = await createClient()
    .from("leave_public_holidays")
    .select("id, holiday_date, holiday_name, year, is_active, note")
    .eq("year", year)
    .order("holiday_date");
  return data || [];
}

/** Updates the holiday when id is given, otherwise creates it. Returns the error message, or null. */
export async function savePublicHoliday(id: string | null, form: HolidayForm): Promise<string | null> {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const payload = { ...form, note: form.note.trim() || null, created_by: userData.user?.id };
  const { error } = id
    ? await supabase.from("leave_public_holidays").update(payload).eq("id", id)
    : await supabase.from("leave_public_holidays").insert(payload);
  return error ? error.message : null;
}

export async function deletePublicHoliday(id: string): Promise<string | null> {
  const { error } = await createClient().from("leave_public_holidays").delete().eq("id", id);
  return error ? error.message : null;
}

// ── Team capacity ────────────────────────────────────────────────────────────

export async function fetchTeamCapacity(): Promise<TeamCapacity[]> {
  const { data } = await createClient()
    .from("leave_team_capacity")
    .select("*, departments(department_name)")
    .order("max_percent");
  return data || [];
}

/** Sets a department's maximum share of staff on leave. Returns the error message, or null. */
export async function upsertTeamCapacity(departmentId: string, maxPercent: number): Promise<string | null> {
  const { error } = await createClient()
    .from("leave_team_capacity")
    .upsert({ department_id: departmentId, max_percent: maxPercent }, { onConflict: "department_id" });
  return error ? error.message : null;
}

// ── Year-end ─────────────────────────────────────────────────────────────────

export async function fetchYearEndLogs(): Promise<YearEndLog[]> {
  const { data } = await createClient()
    .from("leave_year_end_logs")
    .select("*, profiles(full_name)")
    .order("run_date", { ascending: false })
    .limit(20);
  return data || [];
}

export function fetchYearEndPreview(): Promise<Response> {
  return fetch("/api/hr/leave/year-end");
}

export function runYearEnd(year: number): Promise<Response> {
  return fetch("/api/hr/leave/year-end", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ year }),
  });
}

export function runCarryoverExpirySweep(): Promise<Response> {
  return fetch("/api/hr/leave/carryover-expiry", { method: "POST" });
}
