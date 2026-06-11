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
  const remarks = body.remarks || null;

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
    return NextResponse.json({ error: "Only submitted requests can be approved" }, { status: 400 });
  }

  const pendingApproval = ot.approvals?.find(
    (a: any) => a.status === "pending" && a.approver_id === user.id
  );

  if (!pendingApproval) {
    return NextResponse.json({ error: "No pending approval found for you" }, { status: 403 });
  }

  const now = new Date().toISOString();

  // ── Approve current level ──────────────────────────────────────────────
  const { error: appError } = await supabase
    .from("overtime_approvals")
    .update({ status: "approved", decided_at: now, remarks })
    .eq("id", pendingApproval.id);

  if (appError) {
    return NextResponse.json({ error: appError.message }, { status: 500 });
  }

  // ── Determine next level from planned_levels ───────────────────────────
  const plannedLevels: { approver_id: string; approver_level: number; label: string }[] =
    ot.planned_levels || [];
  const currentLevel = pendingApproval.approver_level;
  const nextLevel = plannedLevels
    .filter((p: any) => p.approver_level > currentLevel)
    .sort((a: any, b: any) => a.approver_level - b.approver_level)[0] ?? null;

  if (nextLevel) {
    // Create the next level approval record
    const { error: insError } = await supabase
      .from("overtime_approvals")
      .insert({
        ot_request_id: id,
        approver_id: nextLevel.approver_id,
        approver_level: nextLevel.approver_level,
        label: nextLevel.label,
        status: "pending",
      });

    if (!insError) {
      // Notify the next approver
      const { data: nextRec } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", nextLevel.approver_id)
        .single();

      if (nextRec) {
        await supabase.from("overtime_notifications").insert({
          ot_request_id: id,
          event_type: "request_submitted",
          recipient_id: nextLevel.approver_id,
          recipient_email: nextRec.email,
          recipient_name: nextRec.full_name,
          subject: "Overtime Request Ready for Your Approval",
          body: `Level ${currentLevel} has approved this request. Your approval is now needed.`,
        });
      }
    }

    // Notify employee that level was approved but more pending
    await supabase.from("overtime_notifications").insert({
      ot_request_id: id,
      event_type: "request_approved",
      recipient_id: ot.employee_id,
      subject: "Overtime Request — Level 1 Approved",
      body: `Level ${currentLevel} (${pendingApproval.label}) approved your request. Waiting for next level approval.`,
    });
  } else {
    // All levels approved — mark request as fully approved
    await supabase
      .from("overtime_requests")
      .update({ status: "approved" })
      .eq("id", id);

    await supabase.from("overtime_notifications").insert({
      ot_request_id: id,
      event_type: "request_approved",
      recipient_id: ot.employee_id,
      subject: "Your Overtime Request Has Been Fully Approved",
      body: `All approval levels have approved your overtime request.`,
    });
  }

  await supabase.from("overtime_audit_log").insert({
    ot_request_id: id,
    action: "approved",
    performed_by: user.id,
    details: { approver_level: pendingApproval.approver_level, next_level: nextLevel?.approver_level ?? null },
  });

  return NextResponse.json({
    success: true,
    approval_id: pendingApproval.id,
    next_level: nextLevel?.approver_level ?? null,
    fully_approved: !nextLevel,
  });
}
