import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const actualHours = body.actual_hours ? parseFloat(body.actual_hours) : null;

  const supabase = createAdminClient();

  const { data: ot, error: fetchError } = await supabase
    .from("overtime_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !ot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (ot.employee_id !== user.id) {
    return NextResponse.json({ error: "Only the employee can clock out" }, { status: 403 });
  }

  if (ot.status !== "in_progress") {
    return NextResponse.json({ error: "Only in-progress requests can be clocked out" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const updateFields: Record<string, any> = { status: "completed" };

  if (actualHours && actualHours > 0) {
    updateFields.hours = actualHours;
  }

  const { error: updateError } = await supabase
    .from("overtime_requests")
    .update(updateFields)
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase.from("overtime_notifications").insert({
    ot_request_id: id,
    event_type: "request_submitted",
    recipient_id: ot.employee_id,
    subject: "Overtime Completed",
    body: `You have clocked out. Total OT: ${actualHours || ot.hours}h.`,
  });

  await supabase.from("overtime_audit_log").insert({
    ot_request_id: id,
    action: "clock_out",
    performed_by: user.id,
    details: {
      clock_out_time: now,
      planned_hours: ot.hours,
      actual_hours: actualHours || ot.hours,
    },
  });

  return NextResponse.json({
    success: true,
    status: "completed",
    clock_out: now,
    actual_hours: actualHours || ot.hours,
  });
}
