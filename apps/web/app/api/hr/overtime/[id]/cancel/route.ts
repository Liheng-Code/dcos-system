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
    .select("*, approvals:overtime_approvals(*)")
    .eq("id", id)
    .single();

  if (fetchError || !ot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (ot.status !== "draft" && ot.status !== "submitted" && ot.status !== "approved" && ot.status !== "needs_revision") {
    return NextResponse.json({ error: "Cannot cancel in current status" }, { status: 400 });
  }

  const isOwner = ot.employee_id === user.id;
  if (!isOwner) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("level")
      .eq("id", user.id)
      .single();
    const isHR = profile?.level && ["HR_Manager", "HR_Admin", "HR_Officer", "Super_Admin", "Admin"].includes(profile.level);
    if (!isHR) {
      return NextResponse.json({ error: "Only the employee or HR can cancel" }, { status: 403 });
    }
  }

  // Cancel any pending approvals
  const pendingApprovals = ot.approvals?.filter((a: any) => a.status === "pending") || [];
  if (pendingApprovals.length > 0) {
    await supabase
      .from("overtime_approvals")
      .update({ status: "cancelled" })
      .in("id", pendingApprovals.map((a: any) => a.id));
  }

  await supabase
    .from("overtime_requests")
    .update({ status: "cancelled" })
    .eq("id", id);

  // Notify pending approvers about the cancellation
  for (const approval of pendingApprovals) {
    const { data: rec } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", approval.approver_id)
      .single();

    if (rec) {
      await supabase.from("overtime_notifications").insert({
        ot_request_id: id,
        event_type: "request_cancelled",
        recipient_id: approval.approver_id,
        recipient_email: rec.email,
        recipient_name: rec.full_name,
        subject: "Overtime Request Withdrawn",
        body: `The overtime request has been withdrawn by ${isOwner ? "the employee" : "HR"} and no longer requires your approval.`,
      });
    }
  }

  await supabase.from("overtime_audit_log").insert({
    ot_request_id: id,
    action: "cancelled",
    performed_by: user.id,
    details: { previous_status: ot.status, pending_approvals_cancelled: pendingApprovals.length },
  });

  return NextResponse.json({ success: true, status: "cancelled", pending_approvals_cancelled: pendingApprovals.length });
}
