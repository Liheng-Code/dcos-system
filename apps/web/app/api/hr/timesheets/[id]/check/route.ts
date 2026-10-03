import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkTimesheet } from "@/lib/hr/timesheet-generation";
import { getTimesheetUser } from "../../_utils";

// Compares a timesheet's booked hours per day with what attendance recorded. Advisory.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getTimesheetUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const supabase = createAdminClient();
  const { data: timesheet } = await supabase.from("timesheets").select("employee_id").eq("id", id).maybeSingle();
  if (!timesheet) return NextResponse.json({ error: "Timesheet not found" }, { status: 404 });
  if (!auth.canManage && timesheet.employee_id !== auth.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    return NextResponse.json(await checkTimesheet(supabase, id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Check failed" }, { status: 500 });
  }
}
