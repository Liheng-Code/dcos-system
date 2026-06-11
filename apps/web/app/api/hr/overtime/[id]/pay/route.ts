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

  const { data: profile } = await supabase
    .from("profiles")
    .select("level")
    .eq("id", user.id)
    .single();

  const canPay = profile?.level && [
    "HR_Manager", "HR_Admin", "Payroll_Officer", "Super_Admin", "Admin",
  ].includes(profile.level);

  if (!canPay) {
    return NextResponse.json({ error: "Only HR and Payroll can mark OT as paid" }, { status: 403 });
  }

  const { data: ot } = await supabase
    .from("overtime_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (!ot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (ot.status !== "verified") {
    return NextResponse.json({ error: "Only verified OT can be marked as paid" }, { status: 400 });
  }

  const now = new Date().toISOString();

  await supabase
    .from("overtime_requests")
    .update({ status: "paid" })
    .eq("id", id);

  await supabase
    .from("overtime_payroll")
    .update({ status: "paid", paid_at: now })
    .eq("ot_request_id", id);

  await supabase.from("overtime_notifications").insert({
    ot_request_id: id,
    event_type: "request_paid",
    recipient_id: ot.employee_id,
    subject: "Your Overtime Has Been Paid",
    body: `Your overtime (${ot.hours}h) has been processed for payment.`,
  });

  await supabase.from("overtime_audit_log").insert({
    ot_request_id: id,
    action: "paid",
    performed_by: user.id,
    details: { paid_at: now },
  });

  return NextResponse.json({ success: true, status: "paid" });
}
