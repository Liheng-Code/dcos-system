import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { defaultHoursForDate, getTimesheetUser, normalizeWeekStart, recalcTimesheetTotals, weekDates, weekEnd } from "../_utils";

interface ProfileRow {
  id: string;
  full_name: string | null;
  employee_id: string | null;
  status: string | null;
}

export async function POST(request: NextRequest) {
  const auth = await getTimesheetUser();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const weekStart = normalizeWeekStart(body.week_start_date);
  const dates = weekDates(weekStart);
  const targetEmployeeId = typeof body.employee_id === "string" ? body.employee_id : null;
  const supabase = createAdminClient();

  if (targetEmployeeId && !auth.canManage && targetEmployeeId !== auth.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: settings } = await supabase
    .from("payroll_settings")
    .select("value")
    .eq("key", "working_time")
    .maybeSingle();
  const hoursPerDay = Number(settings?.value?.hours_per_day ?? 8);

  let profileQuery = supabase
    .from("profiles")
    .select("id, full_name, employee_id, status")
    .order("full_name");

  if (targetEmployeeId) {
    profileQuery = profileQuery.eq("id", targetEmployeeId);
  } else if (!auth.canManage) {
    profileQuery = profileQuery.eq("id", auth.id);
  } else {
    profileQuery = profileQuery.eq("status", "active");
  }

  const { data: profiles, error: profileError } = await profileQuery;
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const employees = (profiles ?? []) as ProfileRow[];
  if (employees.length === 0) {
    return NextResponse.json({ generated: 0, updated: 0, week_start: weekStart, week_end: weekEnd(weekStart) });
  }

  const employeeIds = employees.map((employee) => employee.id);
  const { data: reportingRows } = await supabase
    .from("reporting_structure")
    .select("employee_id, manager_id")
    .in("employee_id", employeeIds)
    .is("effective_to", null);

  const managerByEmployee = new Map((reportingRows ?? []).map((row) => [row.employee_id as string, row.manager_id as string]));

  const { data: attendanceRows, error: attendanceError } = await supabase
    .from("attendance_records")
    .select("employee_id, attendance_date, attendance_type, hours_worked")
    .in("employee_id", employeeIds)
    .gte("attendance_date", weekStart)
    .lte("attendance_date", weekEnd(weekStart));

  if (attendanceError) return NextResponse.json({ error: attendanceError.message }, { status: 500 });

  const attendanceByEmployeeDate = new Map<string, { attendance_type: string | null; hours_worked: number | null }>();
  for (const row of attendanceRows ?? []) {
    attendanceByEmployeeDate.set(`${row.employee_id}|${row.attendance_date}`, {
      attendance_type: row.attendance_type,
      hours_worked: row.hours_worked,
    });
  }

  let generated = 0;
  let updated = 0;

  for (const employee of employees) {
    const { data: existing } = await supabase
      .from("timesheets")
      .select("id, status")
      .eq("employee_id", employee.id)
      .eq("week_start_date", weekStart)
      .maybeSingle();

    let timesheetId = existing?.id as string | undefined;
    if (!timesheetId) {
      const { data: created, error: createError } = await supabase
        .from("timesheets")
        .insert({
          employee_id: employee.id,
          approver_id: managerByEmployee.get(employee.id) ?? null,
          week_start_date: weekStart,
          week_end_date: weekEnd(weekStart),
          status: "draft",
        })
        .select("id")
        .single();

      if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });
      timesheetId = created.id;
      generated++;
    } else if (!["draft", "rejected"].includes(existing?.status ?? "")) {
      continue;
    } else {
      updated++;
    }

    if (!timesheetId) continue;

    const { data: existingEntries } = await supabase
      .from("timesheet_entries")
      .select("id, entry_date, ot_hours")
      .eq("timesheet_id", timesheetId);

    const entryByDate = new Map((existingEntries ?? []).map((entry) => [entry.entry_date as string, entry]));

    for (const date of dates) {
      const attendance = attendanceByEmployeeDate.get(`${employee.id}|${date}`);
      const hours = defaultHoursForDate(date, attendance?.attendance_type, attendance?.hours_worked, hoursPerDay);
      const description = attendance?.attendance_type
        ? attendance.attendance_type.replace(/_/g, " ")
        : "No attendance record";
      const existingEntry = entryByDate.get(date);

      if (existingEntry) {
        if (Number(existingEntry.ot_hours ?? 0) > 0 && hours === 0) continue;
        const { error } = await supabase
          .from("timesheet_entries")
          .update({
            hours_worked: hours,
            task_description: description,
          })
          .eq("id", existingEntry.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      } else {
        const { error } = await supabase
          .from("timesheet_entries")
          .insert({
            timesheet_id: timesheetId,
            entry_date: date,
            task_description: description,
            hours_worked: hours,
            ot_hours: 0,
          });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    const { error } = await recalcTimesheetTotals(timesheetId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ generated, updated, week_start: weekStart, week_end: weekEnd(weekStart) });
}
