import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkTimesheet } from "@/lib/hr/timesheet-generation";
import { getTimesheetUser, recalcTimesheetTotals } from "../../_utils";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getTimesheetUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const supabase = createAdminClient();
  const { data: timesheet } = await supabase
    .from("timesheets")
    .select("id, employee_id, status")
    .eq("id", id)
    .maybeSingle();

  if (!timesheet) return NextResponse.json({ error: "Timesheet not found" }, { status: 404 });
  if (!auth.canManage && timesheet.employee_id !== auth.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!["draft", "rejected"].includes(timesheet.status)) {
    return NextResponse.json({ error: "Only draft or rejected timesheets can be submitted" }, { status: 400 });
  }

  const totals = await recalcTimesheetTotals(id);
  if (totals.error) return NextResponse.json({ error: totals.error.message }, { status: 500 });

  const { error } = await supabase
    .from("timesheets")
    .update({ status: "submitted", submission_date: new Date().toISOString(), approval_notes: null })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Advisory only: a mismatch with attendance is reported to the submitter, not blocked.
  const check = await checkTimesheet(supabase, id).catch(() => null);
  return NextResponse.json({ success: true, status: "submitted", issues: check?.issues ?? [] });
}
