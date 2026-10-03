// Generates a week's timesheets from the daily attendance facts, and checks a timesheet
// against them. Server-side only: use the admin client. Planning rules: timesheet-split.ts.

import type { createAdminClient } from "@/lib/supabase/server";
import { getBusinessDate } from "./attendance";
import { buildAttendanceDailyRange } from "./attendance-daily-service";
import {
  checkDays,
  planWeek,
  type Allocation,
  type BookedEntry,
  type DayFact,
  type DayIssue,
  type ExistingEntry,
} from "./timesheet-split";

type Admin = ReturnType<typeof createAdminClient>;

export interface GenerateWeekResult {
  weekStart: string;
  weekEnd: string;
  generated: number;
  updated: number;
  /** Timesheets already submitted or approved: not touched. */
  locked: number;
  /** Days left as a person entered them. */
  keptManualDays: number;
  /** Days where the hours booked do not match attendance after generation. */
  daysToCheck: number;
}

export interface TimesheetCheck {
  issues: DayIssue[];
  /** Payable hours attendance recorded per day, for showing next to what is booked. */
  days: { date: string; status: string; expected: number }[];
}

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

type FactRow = {
  employee_id: string;
  work_date: string;
  status: string;
  regular_hours: number | string;
  ot_hours_actual: number | string;
  project_id: string | null;
  ot: { project_id: string | null; wbs_node_id: string | null; task_id: string | null; ot_type: string | null } | null;
};

const FACT_COLUMNS =
  "employee_id, work_date, status, regular_hours, ot_hours_actual, project_id, ot:overtime_requests(project_id, wbs_node_id, task_id, ot_type)";

const toFact = (r: FactRow): DayFact => ({
  date: r.work_date,
  status: r.status,
  regular_hours: Number(r.regular_hours),
  ot_hours_actual: Number(r.ot_hours_actual),
  ot: r.ot,
});

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = map.get(k);
    if (list) list.push(r); else map.set(k, [r]);
  }
  return map;
}

export async function recalcTotals(supabase: Admin, timesheetId: string) {
  const { data, error } = await supabase.from("timesheet_entries").select("hours_worked, ot_hours").eq("timesheet_id", timesheetId);
  if (error) throw new Error(error.message);
  const totals = (data ?? []).reduce(
    (s, e) => ({ total_hours: s.total_hours + Number(e.hours_worked ?? 0), total_ot_hours: s.total_ot_hours + Number(e.ot_hours ?? 0) }),
    { total_hours: 0, total_ot_hours: 0 },
  );
  const { error: updateError } = await supabase.from("timesheets").update(totals).eq("id", timesheetId);
  if (updateError) throw new Error(updateError.message);
  return totals;
}

/**
 * Refreshes attendance for the week, then creates or refreshes each employee's draft timesheet
 * from it. Submitted/approved timesheets and manually edited days are left alone.
 */
export async function generateTimesheetWeek(
  supabase: Admin,
  opts: { weekStart: string; employeeIds?: string[] },
): Promise<GenerateWeekResult> {
  const weekStart = opts.weekStart;
  const weekEnd = addDays(weekStart, 6);
  const today = getBusinessDate();

  let profileQuery = supabase.from("profiles").select("id").eq("status", "active");
  if (opts.employeeIds && opts.employeeIds.length > 0) profileQuery = profileQuery.in("id", opts.employeeIds);
  const { data: profiles, error: pErr } = await profileQuery;
  if (pErr) throw new Error(`profiles: ${pErr.message}`);
  const ids = (profiles ?? []).map((p: { id: string }) => p.id);
  const result: GenerateWeekResult = { weekStart, weekEnd, generated: 0, updated: 0, locked: 0, keptManualDays: 0, daysToCheck: 0 };
  if (ids.length === 0) return result;

  // Fresh facts for every day of the week that has started.
  if (weekStart <= today) await buildAttendanceDailyRange(supabase, { from: weekStart, to: weekEnd, employeeIds: ids });

  const [factsRes, assignRes, reportingRes, timesheetsRes] = await Promise.all([
    supabase.from("attendance_daily").select(FACT_COLUMNS).in("employee_id", ids).gte("work_date", weekStart).lte("work_date", weekEnd),
    supabase.from("employee_project_assignments").select("employee_id, project_id, allocation_percent, start_date, end_date").in("employee_id", ids).eq("status", "active"),
    supabase.from("reporting_structure").select("employee_id, manager_id").in("employee_id", ids).is("effective_to", null),
    supabase.from("timesheets").select("id, employee_id, status").in("employee_id", ids).eq("week_start_date", weekStart),
  ]);
  for (const [name, res] of [["attendance_daily", factsRes], ["employee_project_assignments", assignRes], ["reporting_structure", reportingRes], ["timesheets", timesheetsRes]] as const) {
    if (res.error) throw new Error(`${name}: ${res.error.message}`);
  }

  const factsByEmp = groupBy((factsRes.data ?? []) as unknown as FactRow[], (r) => r.employee_id);
  const assignsByEmp = groupBy((assignRes.data ?? []) as { employee_id: string; project_id: string; allocation_percent: number | string; start_date: string | null; end_date: string | null }[], (r) => r.employee_id);
  const managerByEmp = new Map((reportingRes.data ?? []).map((r: { employee_id: string; manager_id: string }) => [r.employee_id, r.manager_id]));
  const timesheetByEmp = new Map((timesheetsRes.data ?? []).map((t: { id: string; employee_id: string; status: string }) => [t.employee_id, t]));

  for (const employeeId of ids) {
    const facts = factsByEmp.get(employeeId) ?? [];
    let timesheet = timesheetByEmp.get(employeeId);

    if (timesheet && !["draft", "rejected"].includes(timesheet.status)) { result.locked++; continue; }
    if (!timesheet && facts.every((f) => Number(f.regular_hours) + Number(f.ot_hours_actual) === 0)) continue; // nothing to book yet

    if (!timesheet) {
      const { data: created, error } = await supabase
        .from("timesheets")
        .insert({ employee_id: employeeId, approver_id: managerByEmp.get(employeeId) ?? null, week_start_date: weekStart, week_end_date: weekEnd, status: "draft" })
        .select("id, employee_id, status")
        .single();
      if (error) throw new Error(`timesheets: ${error.message}`);
      timesheet = created;
      result.generated++;
    } else {
      result.updated++;
    }

    const { data: existingRows, error: eErr } = await supabase.from("timesheet_entries").select("id, entry_date, source, hours_worked, ot_hours").eq("timesheet_id", timesheet!.id);
    if (eErr) throw new Error(`timesheet_entries: ${eErr.message}`);

    const assigns = assignsByEmp.get(employeeId) ?? [];
    const dailyProject = new Map(facts.map((f) => [f.work_date, f.project_id]));
    const allocationsFor = (date: string): Allocation[] => {
      const active = assigns.filter((a) => (!a.start_date || a.start_date <= date) && (!a.end_date || a.end_date >= date));
      if (active.length > 0) return active.map((a) => ({ project_id: a.project_id, wbs_node_id: null, task_id: null, percent: Number(a.allocation_percent) }));
      const single = dailyProject.get(date) ?? null;
      return [{ project_id: single, wbs_node_id: null, task_id: null, percent: 100 }];
    };

    const plan = planWeek(facts.map(toFact), (existingRows ?? []) as ExistingEntry[], allocationsFor);
    result.keptManualDays += plan.keptManualDates.length;

    if (plan.deleteIds.length > 0) {
      const { error } = await supabase.from("timesheet_entries").delete().in("id", plan.deleteIds);
      if (error) throw new Error(`timesheet_entries: ${error.message}`);
    }
    if (plan.insert.length > 0) {
      const { error } = await supabase.from("timesheet_entries").insert(plan.insert.map((e) => ({ ...e, timesheet_id: timesheet!.id })));
      if (error) throw new Error(`timesheet_entries: ${error.message}`);
    }
    await recalcTotals(supabase, timesheet!.id);

    const { data: after } = await supabase.from("timesheet_entries").select("entry_date, hours_worked, ot_hours").eq("timesheet_id", timesheet!.id);
    result.daysToCheck += checkDays(facts.map(toFact), (after ?? []) as BookedEntry[]).length;
  }
  return result;
}

/** How a timesheet's booked hours compare with attendance. Advisory. */
export async function checkTimesheet(supabase: Admin, timesheetId: string): Promise<TimesheetCheck | null> {
  const { data: ts } = await supabase.from("timesheets").select("employee_id, week_start_date, week_end_date").eq("id", timesheetId).maybeSingle();
  if (!ts) return null;
  const [factsRes, entriesRes] = await Promise.all([
    supabase.from("attendance_daily").select(FACT_COLUMNS).eq("employee_id", ts.employee_id).gte("work_date", ts.week_start_date).lte("work_date", ts.week_end_date),
    supabase.from("timesheet_entries").select("entry_date, hours_worked, ot_hours").eq("timesheet_id", timesheetId),
  ]);
  if (factsRes.error) throw new Error(`attendance_daily: ${factsRes.error.message}`);
  if (entriesRes.error) throw new Error(`timesheet_entries: ${entriesRes.error.message}`);
  const facts = ((factsRes.data ?? []) as unknown as FactRow[]).map(toFact);
  return {
    issues: checkDays(facts, (entriesRes.data ?? []) as BookedEntry[]),
    days: facts.map((f) => ({ date: f.date, status: f.status, expected: Math.round((f.regular_hours + f.ot_hours_actual) * 100) / 100 })),
  };
}
