import { SupabaseClient } from "@supabase/supabase-js";
import { eachDayOfInterval, format, parseISO } from "date-fns";

export interface LeaveEmployeeProfile {
  id: string;
  employee_id: string | null;
  full_name: string | null;
  status: string | null;
}

export async function getLeaveEmployeeProfile(
  admin: SupabaseClient,
  userId: string,
): Promise<LeaveEmployeeProfile | null> {
  const { data } = await admin
    .from("profiles")
    .select("id, employee_id, full_name, status")
    .eq("id", userId)
    .maybeSingle();

  return (data as LeaveEmployeeProfile | null) ?? null;
}

// ── Balance ──────────────────────────────────────────────────────────────

export interface LeaveBalanceSummaryRow {
  leave_name: string;
  allocated_days: number;
  used_days: number;
  carried_over_days: number;
  remaining_days: number;
}

export async function getLeaveBalanceSummary(
  admin: SupabaseClient,
  employeeId: string,
  fiscalYear = new Date().getFullYear(),
): Promise<LeaveBalanceSummaryRow[]> {
  const { data } = await admin
    .from("leave_balances")
    .select("allocated_days, used_days, carried_over_days, remaining_days, leave_types(leave_name)")
    .eq("employee_id", employeeId)
    .eq("fiscal_year", fiscalYear);

  return ((data ?? []) as unknown as Array<{
    allocated_days: number;
    used_days: number;
    carried_over_days: number;
    remaining_days: number;
    leave_types: { leave_name: string } | null;
  }>).map((row) => ({
    leave_name: row.leave_types?.leave_name ?? "Unknown",
    allocated_days: row.allocated_days,
    used_days: row.used_days,
    carried_over_days: row.carried_over_days,
    remaining_days: row.remaining_days,
  }));
}

// ── My requests ──────────────────────────────────────────────────────────

export interface LeaveRequestSummaryRow {
  id: string;
  leave_name: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: string;
  is_half_day: boolean;
  pending_approver_name: string | null;
}

interface RawLeaveRequestRow {
  id: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: string;
  is_half_day: boolean;
  approver_1_id: string | null;
  approver_1_status: string | null;
  approver_2_id: string | null;
  approver_2_status: string | null;
  leave_types: { leave_name: string } | null;
}

function getPendingApproverId(row: RawLeaveRequestRow): string | null {
  if (row.status !== "submitted" && row.status !== "pending_cancellation") return null;
  if (row.approver_1_status === "pending") return row.approver_1_id;
  if (row.approver_1_status === "approved" && row.approver_2_status === "pending") return row.approver_2_id;
  return null;
}

export async function getMyLeaveRequests(
  admin: SupabaseClient,
  employeeId: string,
  limit = 10,
): Promise<LeaveRequestSummaryRow[]> {
  const { data } = await admin
    .from("leave_requests")
    .select(
      "id, start_date, end_date, days_requested, status, is_half_day, approver_1_id, approver_1_status, approver_2_id, approver_2_status, leave_types(leave_name)",
    )
    .eq("employee_id", employeeId)
    .order("submission_date", { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as unknown as RawLeaveRequestRow[];

  const approverIds = new Set<string>();
  for (const row of rows) {
    const pendingId = getPendingApproverId(row);
    if (pendingId) approverIds.add(pendingId);
  }

  let approverNames: Record<string, string> = {};
  if (approverIds.size > 0) {
    const { data: approvers } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", [...approverIds]);
    approverNames = Object.fromEntries(
      ((approvers ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, p.full_name ?? "Unknown"]),
    );
  }

  return rows.map((row) => {
    const pendingId = getPendingApproverId(row);
    return {
      id: row.id,
      leave_name: row.leave_types?.leave_name ?? "Unknown",
      start_date: row.start_date,
      end_date: row.end_date,
      days_requested: row.days_requested,
      status: row.status,
      is_half_day: row.is_half_day,
      pending_approver_name: pendingId ? approverNames[pendingId] ?? null : null,
    };
  });
}

// ── Pending approvals (for an approver) ────────────────────────────────────

export interface PendingApprovalRow {
  id: string;
  employee_name: string;
  employee_code: string | null;
  leave_name: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  reason: string | null;
}

export async function getPendingApprovalsForApprover(
  admin: SupabaseClient,
  approverId: string,
): Promise<PendingApprovalRow[]> {
  const { data } = await admin
    .from("leave_requests")
    .select(
      `id, start_date, end_date, days_requested, reason, approver_1_id, approver_1_status, approver_2_id, approver_2_status,
       profiles!leave_requests_employee_id_fkey(full_name, employee_id),
       leave_types(leave_name)`,
    )
    .or(`approver_1_id.eq.${approverId},approver_2_id.eq.${approverId}`)
    .eq("status", "submitted")
    .order("start_date", { ascending: true });

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    start_date: string;
    end_date: string;
    days_requested: number;
    reason: string | null;
    approver_1_id: string | null;
    approver_1_status: string | null;
    approver_2_id: string | null;
    approver_2_status: string | null;
    profiles: { full_name: string | null; employee_id: string | null } | null;
    leave_types: { leave_name: string } | null;
  }>;

  // "Whose turn" filtering — mirrors approvals/page.tsx. Cancellation
  // decisions (status='pending_cancellation') are deliberately excluded;
  // that flow is out of scope for the bot (see decideLeaveRequest).
  return rows
    .filter((row) => {
      if (row.approver_1_id === approverId) return row.approver_1_status === "pending";
      if (row.approver_2_id === approverId) return row.approver_1_status === "approved" && row.approver_2_status === "pending";
      return false;
    })
    .map((row) => ({
      id: row.id,
      employee_name: row.profiles?.full_name ?? "Unknown",
      employee_code: row.profiles?.employee_id ?? null,
      leave_name: row.leave_types?.leave_name ?? "Unknown",
      start_date: row.start_date,
      end_date: row.end_date,
      days_requested: row.days_requested,
      reason: row.reason,
    }));
}

// ── Notification (task_alerts, reuses the notify-task edge function pipeline) ──

export async function insertLeaveTaskAlert(
  client: SupabaseClient,
  params: {
    recipientId: string;
    alertType: "leave_pending_approval" | "leave_request_approved" | "leave_request_rejected";
    title: string;
    body: string;
    leaveRequestId: string;
  },
): Promise<void> {
  await client.from("task_alerts").insert({
    recipient_id: params.recipientId,
    alert_type: params.alertType,
    title: params.title,
    body: params.body,
    metadata: { leave_request_id: params.leaveRequestId },
  });
}

// ── Decision (approve/reject) ───────────────────────────────────────────────

export interface DecideLeaveRequestInput {
  requestId: string;
  approverId: string;
  decision: "approved" | "rejected";
  notes?: string | null;
}

export type DecideLeaveRequestError = "not_found" | "not_pending" | "not_your_turn" | "reason_required";

export interface DecideLeaveRequestResult {
  ok: boolean;
  error?: DecideLeaveRequestError;
  employeeName?: string;
  leaveName?: string;
  startDate?: string;
  endDate?: string;
  daysRequested?: number;
  isFinalApproval?: boolean;
  nextApproverName?: string | null;
}

interface DecisionRequestRow {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: string;
  approver_1_id: string | null;
  approver_1_status: string | null;
  approver_2_id: string | null;
  approver_2_status: string | null;
  profiles: { full_name: string | null } | null;
  leave_types: { leave_name: string } | null;
}

export async function decideLeaveRequest(
  admin: SupabaseClient,
  input: DecideLeaveRequestInput,
): Promise<DecideLeaveRequestResult> {
  const { requestId, approverId, decision, notes } = input;

  const { data } = await admin
    .from("leave_requests")
    .select(
      `id, employee_id, leave_type_id, start_date, end_date, days_requested, status,
       approver_1_id, approver_1_status, approver_2_id, approver_2_status,
       profiles!leave_requests_employee_id_fkey(full_name),
       leave_types(leave_name)`,
    )
    .eq("id", requestId)
    .maybeSingle();

  const request = data as unknown as DecisionRequestRow | null;
  if (!request) return { ok: false, error: "not_found" };
  if (request.status !== "submitted") return { ok: false, error: "not_pending" };

  const isApprover1 = request.approver_1_id === approverId;
  const isApprover2 = request.approver_2_id === approverId;
  const canDecide =
    (isApprover1 && request.approver_1_status === "pending") ||
    (isApprover2 && request.approver_1_status === "approved" && request.approver_2_status === "pending");
  if (!canDecide) return { ok: false, error: "not_your_turn" };

  if (decision === "rejected" && !notes?.trim()) return { ok: false, error: "reason_required" };

  const now = new Date().toISOString();
  const employeeName = request.profiles?.full_name ?? "Unknown";
  const leaveName = request.leave_types?.leave_name ?? "Leave";

  if (decision === "rejected") {
    const updates = isApprover1
      ? { status: "rejected", approver_1_status: "rejected", approver_1_date: now, approver_1_notes: notes }
      : { status: "rejected", approver_2_status: "rejected", approver_2_date: now, approver_2_notes: notes };

    await admin.from("leave_requests").update(updates).eq("id", requestId);

    await insertLeaveTaskAlert(admin, {
      recipientId: request.employee_id,
      alertType: "leave_request_rejected",
      title: "Your Leave Request Has Been Rejected",
      body: `Your ${leaveName} request has been rejected. Reason: ${notes}`,
      leaveRequestId: requestId,
    });

    return {
      ok: true,
      employeeName,
      leaveName,
      startDate: request.start_date,
      endDate: request.end_date,
      daysRequested: request.days_requested,
      isFinalApproval: false,
    };
  }

  // decision === "approved"
  let updates: Record<string, unknown> = {};
  let isFinalApproval = false;
  let nextApproverName: string | null = null;

  if (isApprover1) {
    updates = { approver_1_status: "approved", approver_1_date: now };
    isFinalApproval = !request.approver_2_id;
    if (!isFinalApproval && request.approver_2_id) {
      const { data: approver2Profile } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", request.approver_2_id)
        .maybeSingle();
      nextApproverName = (approver2Profile as { full_name: string | null } | null)?.full_name ?? null;

      await insertLeaveTaskAlert(admin, {
        recipientId: request.approver_2_id,
        alertType: "leave_pending_approval",
        title: `Leave Request from ${employeeName}`,
        body: `${employeeName}'s leave request requires your approval.`,
        leaveRequestId: requestId,
      });
    }
  } else {
    updates = { approver_2_status: "approved", approver_2_date: now };
    isFinalApproval = true;
  }

  if (isFinalApproval) {
    updates.status = "approved";

    // Deduct balance: carried-over days first, then allocated — same math as
    // leave-request-detail.tsx's handleApprove.
    const { data: balance } = await admin
      .from("leave_balances")
      .select("id, carried_over_days, allocated_days, used_days, remaining_days")
      .eq("employee_id", request.employee_id)
      .eq("leave_type_id", request.leave_type_id)
      .eq("fiscal_year", new Date().getFullYear())
      .maybeSingle();

    if (balance) {
      const bal = balance as {
        id: string;
        carried_over_days: number;
        allocated_days: number;
        used_days: number;
        remaining_days: number;
      };
      let remaining = request.days_requested;
      let newCarried = bal.carried_over_days;
      let newAllocated = bal.allocated_days;

      if (newCarried >= remaining) {
        newCarried -= remaining;
        remaining = 0;
      } else {
        remaining -= newCarried;
        newCarried = 0;
        newAllocated -= remaining;
      }

      await admin
        .from("leave_balances")
        .update({
          carried_over_days: Math.max(newCarried, 0),
          allocated_days: Math.max(newAllocated, 0),
          used_days: bal.used_days + request.days_requested,
          remaining_days: Math.max(bal.remaining_days - request.days_requested, 0),
          last_updated: now,
        })
        .eq("id", bal.id);
    }

    // Sync attendance: mark leave dates as LEAVE type — same as syncAttendanceForLeave.
    const dates = eachDayOfInterval({ start: parseISO(request.start_date), end: parseISO(request.end_date) });
    for (const d of dates) {
      await admin.from("attendance_records").upsert(
        {
          employee_id: request.employee_id,
          attendance_date: format(d, "yyyy-MM-dd"),
          attendance_type: "LEAVE",
          verified: true,
        },
        { onConflict: "employee_id,attendance_date", ignoreDuplicates: false },
      );
    }

    await insertLeaveTaskAlert(admin, {
      recipientId: request.employee_id,
      alertType: "leave_request_approved",
      title: "Your Leave Request Has Been Approved",
      body: `Your ${leaveName} request for ${request.days_requested} day(s) from ${request.start_date} has been approved.`,
      leaveRequestId: requestId,
    });
  }

  await admin.from("leave_requests").update(updates).eq("id", requestId);

  return {
    ok: true,
    employeeName,
    leaveName,
    startDate: request.start_date,
    endDate: request.end_date,
    daysRequested: request.days_requested,
    isFinalApproval,
    nextApproverName,
  };
}
