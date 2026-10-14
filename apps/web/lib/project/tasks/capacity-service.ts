import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeCapacity,
  type CapacityCalendar,
  type CapacityResult,
  type CapacityThresholds,
  type LeaveSpan,
  type PlannedTask,
} from "./capacity";

/** Task statuses that no longer consume planned capacity. */
const INACTIVE_STATUSES = ["closed", "cancelled", "completed", "approved", "rejected"];

export interface LoadCapacityParams {
  profileIds: string[];
  from: string;
  to: string;
  /** Calendar to use: the project's default calendar when given, else any default calendar. */
  projectId?: string | null;
  thresholds?: Partial<CapacityThresholds>;
}

export async function loadCalendar(
  supabase: SupabaseClient,
  projectId: string | null | undefined,
): Promise<CapacityCalendar | null> {
  let query = supabase
    .from("plan_calendars")
    .select("id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, hours_per_day, is_default")
    .eq("is_default", true)
    .limit(1);
  if (projectId) query = query.eq("project_id", projectId);
  const { data: cal } = await query.maybeSingle();
  if (!cal) return null;

  const { data: ex } = await supabase
    .from("plan_calendar_exceptions")
    .select("exception_date, is_working")
    .eq("calendar_id", cal.id);

  return {
    workdays: [cal.sunday, cal.monday, cal.tuesday, cal.wednesday, cal.thursday, cal.friday, cal.saturday].map(Boolean),
    exceptions: new Map((ex ?? []).map((e) => [String(e.exception_date).slice(0, 10), Boolean(e.is_working)])),
    hoursPerDay: cal.hours_per_day ? Number(cal.hours_per_day) : undefined,
  };
}

export async function loadHolidays(supabase: SupabaseClient, from: string, to: string): Promise<Set<string>> {
  const { data } = await supabase
    .from("leave_public_holidays")
    .select("holiday_date")
    .eq("is_active", true)
    .gte("holiday_date", from)
    .lte("holiday_date", to);
  return new Set((data ?? []).map((h) => String(h.holiday_date).slice(0, 10)));
}

/**
 * Loads calendar, holidays, leave and assigned work for each employee and computes capacity.
 * Planned work covers the employee's active tasks across all projects (hours only are used).
 * Known limitation: one calendar (the given project's, else a default) is applied to every task.
 */
export async function loadEmployeeCapacity(
  supabase: SupabaseClient,
  params: LoadCapacityParams,
): Promise<Map<string, CapacityResult>> {
  const { profileIds, from, to } = params;
  const result = new Map<string, CapacityResult>();
  if (profileIds.length === 0) return result;

  const [calendar, holidaysRes, leaveRes, tasksRes, allocRes] = await Promise.all([
    loadCalendar(supabase, params.projectId),
    supabase
      .from("leave_public_holidays")
      .select("holiday_date")
      .eq("is_active", true)
      .gte("holiday_date", from)
      .lte("holiday_date", to),
    supabase
      .from("leave_requests")
      .select("employee_id, start_date, end_date, status, is_half_day")
      .in("employee_id", profileIds)
      .in("status", ["approved", "submitted"])
      .lte("start_date", to)
      .gte("end_date", from),
    supabase
      .from("wbs_tasks")
      .select("id, owner_id, start_date, end_date, estimated_hours, planned_hours, status")
      .in("owner_id", profileIds)
      .not("status", "in", `(${INACTIVE_STATUSES.join(",")})`)
      .lte("start_date", to)
      .gte("end_date", from),
    supabase
      .from("employee_project_assignments")
      .select("employee_id, allocation_percent, start_date, end_date")
      .in("employee_id", profileIds)
      .eq("status", "active"),
  ]);

  const holidays = new Set((holidaysRes.data ?? []).map((h) => String(h.holiday_date).slice(0, 10)));

  const leaveBy = new Map<string, LeaveSpan[]>();
  for (const l of leaveRes.data ?? []) {
    const list = leaveBy.get(l.employee_id as string) ?? [];
    list.push({
      start: String(l.start_date),
      end: String(l.end_date),
      status: String(l.status),
      isHalfDay: Boolean(l.is_half_day),
    });
    leaveBy.set(l.employee_id as string, list);
  }

  const tasksBy = new Map<string, PlannedTask[]>();
  for (const t of tasksRes.data ?? []) {
    const hours = Number(t.estimated_hours ?? t.planned_hours ?? 0);
    const list = tasksBy.get(t.owner_id as string) ?? [];
    list.push({
      taskId: t.id as string,
      start: (t.start_date as string | null) ?? null,
      end: (t.end_date as string | null) ?? null,
      hours: Number.isFinite(hours) ? hours : 0,
    });
    tasksBy.set(t.owner_id as string, list);
  }

  const allocBy = new Map<string, number>();
  for (const a of allocRes.data ?? []) {
    const overlaps =
      (!a.start_date || String(a.start_date) <= to) && (!a.end_date || String(a.end_date) >= from);
    if (!overlaps) continue;
    allocBy.set(a.employee_id as string, (allocBy.get(a.employee_id as string) ?? 0) + Number(a.allocation_percent ?? 0));
  }

  for (const id of profileIds) {
    const tasks = tasksBy.get(id) ?? [];
    const base = computeCapacity({
      from,
      to,
      calendar,
      holidays,
      leave: leaveBy.get(id) ?? [],
      tasks,
      allocationPercentTotal: allocBy.get(id) ?? null,
      thresholds: params.thresholds,
    });
    const noEstimate = tasks.filter((t) => !(t.hours > 0)).length;
    if (noEstimate > 0) {
      base.limitations.push(`${noEstimate} assigned task(s) have no estimated hours and are not counted.`);
    }
    result.set(id, base);
  }
  return result;
}
