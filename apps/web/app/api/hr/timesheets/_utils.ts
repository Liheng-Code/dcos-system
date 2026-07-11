import { addDays, format, isWeekend, parseISO, startOfWeek } from "date-fns";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

export const WORKING_ATTENDANCE = new Set(["PRESENT", "LATE", "WFH", "SITE_WORK", "BUSINESS_TRIP"]);
export const HR_LEVELS = new Set(["HR_Manager", "HR_Admin", "HR_Officer", "Payroll_Officer", "Super_Admin", "Admin"]);

export interface TimesheetUser {
  id: string;
  canManage: boolean;
}

export function normalizeWeekStart(input?: string | null): string {
  const base = input ? parseISO(input) : new Date();
  return format(startOfWeek(base, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function weekEnd(weekStart: string): string {
  return format(addDays(parseISO(weekStart), 6), "yyyy-MM-dd");
}

export function weekDates(weekStart: string): string[] {
  const start = parseISO(weekStart);
  return Array.from({ length: 7 }, (_, index) => format(addDays(start, index), "yyyy-MM-dd"));
}

export function isWorkingAttendance(type?: string | null): boolean {
  return WORKING_ATTENDANCE.has((type ?? "").toUpperCase());
}

export async function getTimesheetUser(): Promise<TimesheetUser | { error: Response }> {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const supabase = createAdminClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("level, role")
    .eq("id", user.id)
    .maybeSingle();

  const canManage = HR_LEVELS.has(profile?.level ?? "") || profile?.role === "admin";
  return { id: user.id, canManage };
}

export async function recalcTimesheetTotals(timesheetId: string) {
  const supabase = createAdminClient();
  const { data: entries, error } = await supabase
    .from("timesheet_entries")
    .select("hours_worked, ot_hours")
    .eq("timesheet_id", timesheetId);

  if (error) return { error };

  const totals = (entries ?? []).reduce(
    (sum, entry) => ({
      total_hours: sum.total_hours + Number(entry.hours_worked ?? 0),
      total_ot_hours: sum.total_ot_hours + Number(entry.ot_hours ?? 0),
    }),
    { total_hours: 0, total_ot_hours: 0 },
  );

  const { error: updateError } = await supabase
    .from("timesheets")
    .update(totals)
    .eq("id", timesheetId);

  return { error: updateError, totals };
}

export function defaultHoursForDate(date: string, attendanceType?: string | null, attendanceHours?: number | null, hoursPerDay = 8) {
  if (isWeekend(parseISO(date))) return 0;
  if (!attendanceType) return 0;
  if (!isWorkingAttendance(attendanceType)) return 0;
  return Number(attendanceHours ?? hoursPerDay);
}
