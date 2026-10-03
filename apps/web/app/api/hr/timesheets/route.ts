import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkTimesheet } from "@/lib/hr/timesheet-generation";
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
      entries:timesheet_entries(id, entry_date, project_id, wbs_node_id, task_id, task_description, hours_worked, ot_type, ot_hours, notes, source)
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

// Edits a draft/rejected timesheet: change entries, add entries (to split a day across projects),
// delete entries. Anything a person touches becomes source 'manual' and is kept on regeneration.
// The response carries advisory issues where booked hours differ from attendance.
export async function PATCH(request: NextRequest) {
  const auth = await getTimesheetUser();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const timesheetId = body.timesheet_id as string | undefined;
  const entries = (body.entries ?? []) as Array<{
    id?: string;
    entry_date?: string;
    project_id?: string | null;
    wbs_node_id?: string | null;
    task_id?: string | null;
    hours_worked: number;
    ot_hours?: number;
    task_description?: string | null;
    notes?: string | null;
  }>;
  const deleteIds = (body.delete_ids ?? []) as string[];

  if (!timesheetId || !Array.isArray(entries) || !Array.isArray(deleteIds)) {
    return NextResponse.json({ error: "timesheet_id and entries are required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: timesheet } = await supabase
    .from("timesheets")
    .select("id, employee_id, status, week_start_date, week_end_date")
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
    const ot = Number(entry.ot_hours ?? 0);
    if (Number.isNaN(hours) || hours < 0 || hours > 24) {
      return NextResponse.json({ error: "Entry hours must be between 0 and 24" }, { status: 400 });
    }
    if (Number.isNaN(ot) || ot < 0 || ot > hours) {
      return NextResponse.json({ error: "OT hours cannot be more than the entry's hours" }, { status: 400 });
    }
    if (!entry.id && (!entry.entry_date || entry.entry_date < timesheet.week_start_date || entry.entry_date > timesheet.week_end_date)) {
      return NextResponse.json({ error: "A new entry needs a date inside the timesheet week" }, { status: 400 });
    }
  }

  if (deleteIds.length > 0) {
    const { error } = await supabase.from("timesheet_entries").delete().in("id", deleteIds).eq("timesheet_id", timesheetId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (const entry of entries) {
    const values = {
      hours_worked: Number(entry.hours_worked),
      ...(entry.ot_hours !== undefined && { ot_hours: Number(entry.ot_hours) }),
      ...(entry.project_id !== undefined && { project_id: entry.project_id }),
      ...(entry.wbs_node_id !== undefined && { wbs_node_id: entry.wbs_node_id }),
      ...(entry.task_id !== undefined && { task_id: entry.task_id }),
      task_description: entry.task_description ?? null,
      notes: entry.notes ?? null,
      source: "manual" as const,
    };
    const { error } = entry.id
      ? await supabase.from("timesheet_entries").update(values).eq("id", entry.id).eq("timesheet_id", timesheetId)
      : await supabase.from("timesheet_entries").insert({ ...values, timesheet_id: timesheetId, entry_date: entry.entry_date });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error } = await recalcTimesheetTotals(timesheetId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const check = await checkTimesheet(supabase, timesheetId).catch(() => null);
  return NextResponse.json({ success: true, issues: check?.issues ?? [] });
}
