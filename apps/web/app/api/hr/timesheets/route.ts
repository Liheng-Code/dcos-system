import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTimesheetUser, normalizeWeekStart, recalcTimesheetTotals, weekEnd } from "./_utils";

export async function GET(request: NextRequest) {
  const auth = await getTimesheetUser();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const weekStart = normalizeWeekStart(searchParams.get("week_start"));
  const status = searchParams.get("status");
  const employeeId = searchParams.get("employee_id");
  const scope = searchParams.get("scope") ?? "all";
  const supabase = createAdminClient();

  let query = supabase
    .from("timesheets")
    .select(`
      id,
      employee_id,
      week_start_date,
      week_end_date,
      status,
      total_hours,
      total_ot_hours,
      submission_date,
      approver_id,
      approval_date,
      approval_notes,
      employee:profiles!timesheets_employee_id_fkey(full_name, employee_id, department, job_title),
      approver:profiles!timesheets_approver_id_fkey(full_name),
      entries:timesheet_entries(id, entry_date, project_id, wbs_node_id, task_description, hours_worked, ot_type, ot_hours, notes)
    `)
    .eq("week_start_date", weekStart)
    .eq("week_end_date", weekEnd(weekStart))
    .order("week_start_date", { ascending: false });

  if (status && status !== "all") query = query.eq("status", status);
  if (employeeId && auth.canManage) query = query.eq("employee_id", employeeId);
  if (!auth.canManage || scope === "mine") query = query.eq("employee_id", auth.id);
  if (auth.canManage && scope === "review") query = query.in("status", ["submitted"]);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ week_start: weekStart, week_end: weekEnd(weekStart), timesheets: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const auth = await getTimesheetUser();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const timesheetId = body.timesheet_id as string | undefined;
  const entries = body.entries as Array<{
    id: string;
    hours_worked: number;
    task_description?: string | null;
    notes?: string | null;
  }> | undefined;

  if (!timesheetId || !Array.isArray(entries)) {
    return NextResponse.json({ error: "timesheet_id and entries are required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: timesheet } = await supabase
    .from("timesheets")
    .select("id, employee_id, status")
    .eq("id", timesheetId)
    .maybeSingle();

  if (!timesheet) return NextResponse.json({ error: "Timesheet not found" }, { status: 404 });
  if (!auth.canManage && timesheet.employee_id !== auth.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!["draft", "rejected"].includes(timesheet.status)) {
    return NextResponse.json({ error: "Only draft or rejected timesheets can be edited" }, { status: 400 });
  }

  for (const entry of entries) {
    const hours = Number(entry.hours_worked);
    if (!entry.id || Number.isNaN(hours) || hours < 0 || hours > 24) {
      return NextResponse.json({ error: "Entry hours must be between 0 and 24" }, { status: 400 });
    }

    const { error } = await supabase
      .from("timesheet_entries")
      .update({
        hours_worked: hours,
        task_description: entry.task_description ?? null,
        notes: entry.notes ?? null,
      })
      .eq("id", entry.id)
      .eq("timesheet_id", timesheetId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error } = await recalcTimesheetTotals(timesheetId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
