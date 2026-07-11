import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getTimesheetUser } from "../../_utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getTimesheetUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (!notes) return NextResponse.json({ error: "Rejection notes are required" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: timesheet } = await supabase
    .from("timesheets")
    .select("id, approver_id, status")
    .eq("id", id)
    .maybeSingle();

  if (!timesheet) return NextResponse.json({ error: "Timesheet not found" }, { status: 404 });
  if (!auth.canManage && timesheet.approver_id !== auth.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (timesheet.status !== "submitted") {
    return NextResponse.json({ error: "Only submitted timesheets can be rejected" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("timesheets")
    .update({ status: "rejected", approval_date: now, approval_notes: notes, approver_id: auth.id })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("timesheet_approvals").insert({
    timesheet_id: id,
    approver_id: auth.id,
    action: "rejected",
    action_date: now,
    notes,
  });

  return NextResponse.json({ success: true, status: "rejected" });
}
