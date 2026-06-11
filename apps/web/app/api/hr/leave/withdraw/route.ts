import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { requestId } = await req.json();
    if (!requestId) {
      return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Get the leave request to verify ownership
    const { data: leaveReq, error: fetchError } = await supabase
      .from("leave_requests")
      .select("id, employee_id, status, start_date, end_date, days_requested, approver_1_id, approver_2_id, profiles!leave_requests_employee_id_fkey(full_name), leave_types(leave_name)")
      .eq("id", requestId)
      .single();

    if (fetchError || !leaveReq) {
      return NextResponse.json({ error: "Leave request not found" }, { status: 404 });
    }

    if (leaveReq.status !== "submitted") {
      return NextResponse.json({ error: "Only submitted requests can be withdrawn" }, { status: 400 });
    }

    // Update status to withdrawn
    const { error: updateError } = await supabase
      .from("leave_requests")
      .update({
        status: "withdrawn",
        withdrawal_date: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Notify all approvers
    const allApproverIds = [leaveReq.approver_1_id, leaveReq.approver_2_id].filter((id): id is string => !!id);
    const employeeName = (leaveReq.profiles as unknown as { full_name: string })?.full_name || "Employee";

    for (const approverId of [...new Set(allApproverIds)]) {
      const { data: rec } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", approverId)
        .single();

      await supabase.from("leave_notifications").insert({
        leave_request_id: requestId,
        event_type: "request_withdrawn",
        recipient_id: approverId,
        recipient_email: rec?.email,
        recipient_name: rec?.full_name,
        subject: `${employeeName} Withdrew Their Leave Request`,
        body: `${employeeName} has withdrawn their leave request for ${leaveReq.start_date}.`,
      }).maybeSingle();
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
