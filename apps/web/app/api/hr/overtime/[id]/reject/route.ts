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
  const body = await request.json();
  const remarks = body.remarks || "No reason provided";
  const revisionType = body.revision_type || "reject";

  if (!body.remarks) {
    return NextResponse.json({ error: "remarks are required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: ot, error: fetchError } = await supabase
    .from("overtime_requests")
    .select("*, approvals:overtime_approvals(*)")
    .eq("id", id)
    .single();

  if (fetchError || !ot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (ot.status !== "submitted") {
    return NextResponse.json({ error: "Only submitted requests can be rejected" }, { status: 400 });
  }

  const pendingApproval = ot.approvals?.find(
    (a: any) => a.status === "pending" && a.approver_id === user.id
  );

  if (!pendingApproval) {
    return NextResponse.json({ error: "No pending approval found for you" }, { status: 403 });
  }

  const now = new Date().toISOString();

  // ── 3.5: Cancel all remaining pending approvals (orphan cleanup) ──
  const otherPendingIds = ot.approvals
    ?.filter((a: any) => a.id !== pendingApproval.id && a.status === "pending")
    .map((a: any) => a.id) ?? [];

  if (otherPendingIds.length > 0) {
    await supabase
      .from("overtime_approvals")
      .update({ status: "cancelled", decided_at: now })
      .in("id", otherPendingIds);
  }

  // Mark this approval as rejected
  const { error: appError } = await supabase
    .from("overtime_approvals")
    .update({ status: "rejected", decided_at: now, remarks })
    .eq("id", pendingApproval.id);

  if (appError) {
    return NextResponse.json({ error: appError.message }, { status: 500 });
  }

  // ── Phase 3: Set status to needs_revision or rejected ──
  const newStatus = revisionType === "revision" ? "needs_revision" : "rejected";
  const eventType = revisionType === "revision" ? "request_needs_revision" : "request_rejected";
  const subject = revisionType === "revision"
    ? "Your Overtime Request Needs Revision"
    : "Your Overtime Request Has Been Rejected";

  await supabase
    .from("overtime_requests")
    .update({ status: newStatus })
    .eq("id", id);

  // ── 3.6: Notify ALL approvers about the rejection/revision ──
  const allApproverIds = ot.approvals
    ?.map((a: any) => a.approver_id)
    .filter((aid: string) => aid !== ot.employee_id) ?? [];

  // Also include the employee
  const notificationRecipients = [...new Set([ot.employee_id, ...allApproverIds])];

  const { data: recipientProfiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", notificationRecipients);

  const notifInserts = (recipientProfiles || []).map((rp) => ({
    ot_request_id: id,
    event_type: eventType,
    recipient_id: rp.id,
    recipient_email: rp.email,
    recipient_name: rp.full_name,
    subject: rp.id === ot.employee_id ? subject : `Overtime Request ${revisionType === "revision" ? "Sent Back for Revision" : "Rejected"}`,
    body: revisionType === "revision"
      ? `Level ${pendingApproval.approver_level} (${pendingApproval.label}) requested revision. Reason: ${remarks}`
      : `Level ${pendingApproval.approver_level} (${pendingApproval.label}) rejected this request. Reason: ${remarks}`,
  }));

  if (notifInserts.length > 0) {
    await supabase.from("overtime_notifications").insert(notifInserts);
  }

  await supabase.from("overtime_audit_log").insert({
    ot_request_id: id,
    action: revisionType === "revision" ? "edited" : "rejected",
    performed_by: user.id,
    details: { approver_level: pendingApproval.approver_level, revision_type: revisionType, remarks },
  });

  return NextResponse.json({ success: true, status: newStatus });
}
