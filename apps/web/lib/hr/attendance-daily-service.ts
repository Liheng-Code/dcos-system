// Loads each employee's raw facts for a date range, builds the attendance_daily rows
// (attendance-daily.ts) and upserts them. Server-side only: use the admin client.

import type { createAdminClient } from "@/lib/supabase/server";
import { getBusinessDate } from "./attendance";
import {
  buildAttendanceDay,
  type DailyLeave,
  type DailyLog,
  type DailyManualRecord,
  type DailyOtRequest,
  type DailyRow,
  type DailyShift,
} from "./attendance-daily";

type Admin = ReturnType<typeof createAdminClient>;

export interface BuildRangeOptions {
  from: string; // yyyy-mm-dd
  to: string;
  employeeIds?: string[];
}

export interface BuildRangeResult {
  from: string;
  to: string;
  employees: number;
  rows: number;
  needsReview: number;
  skippedManual: number;
}

const MAX_DAYS = 62;
const CHUNK = 500;
// Phnom Penh has no daylight saving: a business day is always UTC+7.
const dayStart = (date: string) => `${date}T00:00:00+07:00`;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const businessDateOf = (iso: string) => getBusinessDate(new Date(iso));

type Dated = { employee_id: string; effective_from: string; effective_to: string | null };
/** The assignment in force on a date: latest start wins. */
function inForce<T extends Dated>(rows: T[] | undefined, date: string): T | null {
  const hit = (rows ?? [])
    .filter((r) => r.effective_from <= date && (r.effective_to === null || r.effective_to >= date))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return hit[0] ?? null;
}

function group<T extends { employee_id: string }>(rows: T[] | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows ?? []) {
    const list = map.get(r.employee_id);
    if (list) list.push(r); else map.set(r.employee_id, [r]);
  }
  return map;
}

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return (res.data ?? ([] as unknown)) as T;
}

export async function buildAttendanceDailyRange(supabase: Admin, opts: BuildRangeOptions): Promise<BuildRangeResult> {
  const today = getBusinessDate();
  const to = opts.to > today ? today : opts.to;
  const { from } = opts;
  if (from > to) return { from, to, employees: 0, rows: 0, needsReview: 0, skippedManual: 0 };
  const dates = datesBetween(from, to);
  if (dates.length > MAX_DAYS) throw new Error(`Range is limited to ${MAX_DAYS} days`);

  let profileQuery = supabase.from("profiles").select("id, join_date").eq("status", "active");
  if (opts.employeeIds && opts.employeeIds.length > 0) profileQuery = profileQuery.in("id", opts.employeeIds);
  const profiles = must(await profileQuery, "profiles") as { id: string; join_date: string | null }[];
  if (profiles.length === 0) return { from, to, employees: 0, rows: 0, needsReview: 0, skippedManual: 0 };
  const ids = profiles.map((p) => p.id);

  const windowStart = dayStart(from);
  const windowEnd = dayStart(addDays(to, 1));

  const [settingsRes, shiftsRes, shiftAssignRes, siteAssignRes, projectRes, logsRes, manualRes, holidayRes, leaveRes, otRes, existingRes] =
    await Promise.all([
      supabase.from("payroll_settings").select("value").eq("key", "working_time").maybeSingle(),
      supabase.from("work_shifts").select("*"),
      supabase.from("employee_shift_assignments").select("employee_id, shift_id, effective_from, effective_to").in("employee_id", ids).lte("effective_from", to).or(`effective_to.is.null,effective_to.gte.${from}`),
      supabase.from("employee_attendance_site_assignments").select("employee_id, site_id, effective_from, effective_to").in("employee_id", ids).lte("effective_from", to).or(`effective_to.is.null,effective_to.gte.${from}`),
      supabase.from("employee_project_assignments").select("employee_id, project_id, start_date, end_date").in("employee_id", ids).eq("status", "active"),
      supabase.from("attendance_logs").select("employee_id, log_time, log_type, is_valid, site_id").in("employee_id", ids).gte("log_time", windowStart).lt("log_time", windowEnd),
      supabase.from("attendance_records").select("employee_id, attendance_date, attendance_type, hours_worked").in("employee_id", ids).gte("attendance_date", from).lte("attendance_date", to),
      supabase.from("leave_public_holidays").select("holiday_date").eq("is_active", true).gte("holiday_date", from).lte("holiday_date", to),
      supabase.from("leave_requests").select("id, employee_id, start_date, end_date, is_half_day").in("employee_id", ids).eq("status", "approved").lte("start_date", to).gte("end_date", from),
      // OT request times are wall-clock values stored as UTC (the form sends no offset), so they are
      // windowed and dated by their UTC parts, not converted to Phnom Penh like attendance logs.
      supabase.from("overtime_requests").select("id, employee_id, hours, start_time").in("employee_id", ids).eq("status", "approved").gte("start_time", `${from}T00:00:00Z`).lt("start_time", `${addDays(to, 1)}T00:00:00Z`),
      supabase.from("attendance_daily").select("employee_id, work_date, source, review_reason, review_note, review_resolved_by, review_resolved_at").in("employee_id", ids).gte("work_date", from).lte("work_date", to),
    ]);

  const settings = (settingsRes.data?.value ?? {}) as { hours_per_day?: number; ot_tolerance_hours?: number };
  const standardHours = Number(settings.hours_per_day ?? 8);
  const otToleranceHours = Number(settings.ot_tolerance_hours ?? 0.25);

  const shiftById = new Map((must(shiftsRes, "work_shifts") as DailyShift[]).map((s) => [s.id, s]));
  const shiftAssign = group(must(shiftAssignRes, "employee_shift_assignments") as (Dated & { shift_id: string })[]);
  const siteAssign = group(must(siteAssignRes, "employee_attendance_site_assignments") as (Dated & { site_id: string })[]);
  const projects = group(must(projectRes, "employee_project_assignments") as { employee_id: string; project_id: string; start_date: string | null; end_date: string | null }[]);
  const manualByKey = new Map(
    (must(manualRes, "attendance_records") as (DailyManualRecord & { employee_id: string; attendance_date: string })[]).map((m) => [`${m.employee_id}|${m.attendance_date}`, m]),
  );
  const holidays = new Set((must(holidayRes, "leave_public_holidays") as { holiday_date: string }[]).map((h) => h.holiday_date));
  const leaves = group(must(leaveRes, "leave_requests") as { id: string; employee_id: string; start_date: string; end_date: string; is_half_day: boolean }[]);

  const logsByKey = new Map<string, DailyLog[]>();
  for (const l of must(logsRes, "attendance_logs") as (DailyLog & { employee_id: string })[]) {
    const key = `${l.employee_id}|${businessDateOf(l.log_time)}`;
    const list = logsByKey.get(key);
    if (list) list.push(l); else logsByKey.set(key, [l]);
  }
  const otByKey = new Map<string, DailyOtRequest[]>();
  for (const o of must(otRes, "overtime_requests") as (DailyOtRequest & { employee_id: string; start_time: string })[]) {
    const key = `${o.employee_id}|${new Date(o.start_time).toISOString().slice(0, 10)}`;
    const list = otByKey.get(key);
    if (list) list.push(o); else otByKey.set(key, [o]);
  }
  const existing = new Map(
    (must(existingRes, "attendance_daily") as { employee_id: string; work_date: string; source: string; review_reason: string | null; review_note: string | null; review_resolved_by: string | null; review_resolved_at: string | null }[])
      .map((r) => [`${r.employee_id}|${r.work_date}`, r]),
  );

  const rows: (DailyRow & { review_note?: string | null; review_resolved_by?: string | null; review_resolved_at?: string | null })[] = [];
  let skippedManual = 0;

  for (const p of profiles) {
    for (const date of dates) {
      if (p.join_date && date < p.join_date) continue;
      const key = `${p.id}|${date}`;
      const stored = existing.get(key);
      if (stored?.source === "manual") { skippedManual++; continue; }

      const shiftId = inForce(shiftAssign.get(p.id), date)?.shift_id;
      const activeProjects = (projects.get(p.id) ?? []).filter((a) => (!a.start_date || a.start_date <= date) && (!a.end_date || a.end_date >= date));
      const leave = (leaves.get(p.id) ?? []).find((l) => l.start_date <= date && l.end_date >= date);

      const row = buildAttendanceDay({
        employeeId: p.id,
        date,
        isFinal: date < today,
        shift: (shiftId ? shiftById.get(shiftId) : null) ?? null,
        assignedSiteId: inForce(siteAssign.get(p.id), date)?.site_id ?? null,
        projectId: activeProjects.length === 1 ? activeProjects[0].project_id : null,
        logs: logsByKey.get(key) ?? [],
        manual: manualByKey.get(key) ?? null,
        isHoliday: holidays.has(date),
        leave: leave ? ({ id: leave.id, is_half_day: !!leave.is_half_day } satisfies DailyLeave) : null,
        approvedOt: otByKey.get(key) ?? [],
        standardHours,
        otToleranceHours,
      });

      // Keep an HR resolution while the reason is unchanged; a new reason needs a fresh look.
      const resolvedStill = stored?.review_resolved_at && stored.review_reason === row.review_reason;
      rows.push({
        ...row,
        needs_review: row.needs_review,
        review_note: resolvedStill ? stored.review_note : null,
        review_resolved_by: resolvedStill ? stored.review_resolved_by : null,
        review_resolved_at: resolvedStill ? stored.review_resolved_at : null,
      });
    }
  }

  const stamp = new Date().toISOString();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => ({ ...r, built_at: stamp }));
    const { error } = await supabase.from("attendance_daily").upsert(chunk, { onConflict: "employee_id,work_date" });
    if (error) throw new Error(`attendance_daily: ${error.message}`);
  }

  return {
    from,
    to,
    employees: profiles.length,
    rows: rows.length,
    needsReview: rows.filter((r) => r.needs_review && !r.review_resolved_at).length,
    skippedManual,
  };
}

export const defaultBuildRange = (): { from: string; to: string } => {
  const yesterday = addDays(getBusinessDate(), -1);
  return { from: yesterday, to: yesterday };
};

