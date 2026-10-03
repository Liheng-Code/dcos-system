import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateTimesheetWeek } from "@/lib/hr/timesheet-generation";
import { getTimesheetUser, normalizeWeekStart } from "../_utils";

// Creates or refreshes draft timesheets for a week from the daily attendance facts.
// Body { week_start_date?, employee_id? }. HR can generate for everyone; others only for themselves.
export async function POST(request: NextRequest) {
  const auth = await getTimesheetUser();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const weekStart = normalizeWeekStart(body.week_start_date);
  const targetEmployeeId = typeof body.employee_id === "string" ? body.employee_id : null;

  if (targetEmployeeId && !auth.canManage && targetEmployeeId !== auth.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const employeeIds = targetEmployeeId ? [targetEmployeeId] : auth.canManage ? undefined : [auth.id];

  try {
    const result = await generateTimesheetWeek(createAdminClient(), { weekStart, employeeIds });
    return NextResponse.json({
      generated: result.generated,
      updated: result.updated,
      locked: result.locked,
      kept_manual_days: result.keptManualDays,
      days_to_check: result.daysToCheck,
      week_start: result.weekStart,
      week_end: result.weekEnd,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Generation failed" }, { status: 500 });
  }
}
