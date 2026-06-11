import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
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
    return NextResponse.json({ error: "Only the employee can clock in" }, { status: 403 });
  }

  if (ot.status !== "approved") {
    return NextResponse.json({ error: "Only approved requests can be clocked in" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("overtime_requests")
    .update({ status: "in_progress" })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase.from("overtime_notifications").insert({
    ot_request_id: id,
    event_type: "request_submitted",
    recipient_id: ot.employee_id,
    subject: "Overtime Started",
    body: `You have clocked in for overtime starting at ${new Date(now).toLocaleTimeString()}.`,
  });

  await supabase.from("overtime_audit_log").insert({
    ot_request_id: id,
    action: "clock_in",
    performed_by: user.id,
    details: { clock_in_time: now, previous_status: "approved" },
  });

  return NextResponse.json({ success: true, status: "in_progress", clock_in: now });
}
