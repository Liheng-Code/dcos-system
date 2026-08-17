import { NextRequest, NextResponse } from "next/server";
import { requireHrAdmin } from "@/lib/hr/auth";
import { notifyPayrollRoles, notifyPayrollEmployees, type PayrollEventType } from "@/components/hr/payroll/payroll-helpers";

interface PayrollPeriodRow {
  id: string;
  status: string;
  label: string | null;
  period_year: number;
  period_month: number;
  rejection_comment: string | null;
}

interface AdvanceRequestBody {
  toStatus?: string;
  action?: string;
  comment?: string;
}

// Forward workflow: current ("from") status -> next ("to") status.
const FORWARD_TRANSITIONS: Record<string, string> = {
  calculated: "hr_reviewed",
  hr_reviewed: "finance_verified",
  finance_verified: "director_approved",
  director_approved: "locked",
  locked: "exported",
  exported: "paid",
};

// "to" status -> the current status a forward transition must be starting from.
const EXPECTED_FROM_STATUS: Record<string, string> = Object.fromEntries(
  Object.entries(FORWARD_TRANSITIONS).map(([from, to]) => [to, from]),
);

// Reject can only happen from these in-review statuses, always back to "calculated".
const REJECTABLE_FROM_STATUSES = ["hr_reviewed", "finance_verified", "director_approved"];

// "to" status -> closest matching notification event for forward transitions.
const FORWARD_EVENT_TYPE: Record<string, PayrollEventType> = {
  hr_reviewed: "payroll_calculated",
  finance_verified: "submitted_to_finance",
  director_approved: "director_approved",
  locked: "payroll_locked",
  exported: "payroll_exported",
  paid: "payroll_paid",
};

function periodLabel(period: PayrollPeriodRow): string {
  return period.label || `${period.period_month}/${period.period_year}`;
}

function forwardFieldUpdates(toStatus: string, userId: string, now: string): Record<string, unknown> {
  const updates: Record<string, unknown> = { status: toStatus };
  if (toStatus === "hr_reviewed") { updates.reviewed_by = userId; updates.reviewed_at = now; }
  if (toStatus === "finance_verified") { updates.verified_by = userId; updates.verified_at = now; }
  if (toStatus === "director_approved") { updates.director_approved_by = userId; updates.director_approved_at = now; }
  if (toStatus === "locked") { updates.locked_by = userId; updates.locked_at = now; }
  if (toStatus === "exported") { updates.exported_at = now; }
  return updates;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ periodId: string }> },
) {
  const auth = await requireHrAdmin();
  if (!auth.supabase || !auth.userId) {
    return NextResponse.json({ success: false, message: auth.error ?? "Unauthorized" }, { status: auth.status });
  }
  const { supabase, userId } = auth;

  const { periodId } = await params;

  const body = await request.json().catch(() => null) as AdvanceRequestBody | null;
  if (!body || typeof body.toStatus !== "string" || body.toStatus.trim() === "") {
    return NextResponse.json({ success: false, message: "toStatus is required" }, { status: 400 });
  }
  if (typeof body.action !== "string" || body.action.trim() === "") {
    return NextResponse.json({ success: false, message: "action is required" }, { status: 400 });
  }

  const toStatus = body.toStatus;
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  const isReject = toStatus === "calculated";

  if (!isReject && !(toStatus in EXPECTED_FROM_STATUS)) {
    return NextResponse.json({ success: false, message: `Invalid toStatus: ${toStatus}` }, { status: 400 });
  }

  const { data: periodData, error: fetchError } = await supabase
    .from("payroll_periods")
    .select("id, status, label, period_year, period_month, rejection_comment")
    .eq("id", periodId)
    .single();

  if (fetchError || !periodData) {
    return NextResponse.json({ success: false, message: "Payroll period not found" }, { status: 404 });
  }

  const period = periodData as PayrollPeriodRow;
  const fromStatus = period.status;

  if (isReject) {
    if (!REJECTABLE_FROM_STATUSES.includes(fromStatus)) {
      return NextResponse.json(
        { success: false, message: `Cannot reject payroll from status "${fromStatus}"` },
        { status: 400 },
      );
    }
    if (comment === "") {
      return NextResponse.json(
        { success: false, message: "A comment is required to reject payroll" },
        { status: 400 },
      );
    }
  } else {
    const expectedFrom = EXPECTED_FROM_STATUS[toStatus];
    if (fromStatus !== expectedFrom) {
      return NextResponse.json(
        {
          success: false,
          message: `Cannot move payroll from "${fromStatus}" to "${toStatus}" — expected current status "${expectedFrom}"`,
        },
        { status: 400 },
      );
    }
  }

  const now = new Date().toISOString();
  const action = isReject ? "payroll_rejected" : body.action;

  const updates: Record<string, unknown> = isReject
    ? { status: "calculated", rejection_comment: comment }
    : forwardFieldUpdates(toStatus, userId, now);

  // Resubmission after a fix: clear any prior rejection comment when re-entering review.
  if (!isReject && fromStatus === "calculated" && toStatus === "hr_reviewed" && period.rejection_comment) {
    updates.rejection_comment = null;
  }

  const { error: updateError } = await supabase
    .from("payroll_periods")
    .update(updates)
    .eq("id", periodId);

  if (updateError) {
    return NextResponse.json({ success: false, message: updateError.message }, { status: 500 });
  }

  // Entry-level status must reach a non-"draft" state for the period to be paid,
  // since "My Payslip" only shows entries whose status isn't "draft".
  if (toStatus === "paid") {
    const { error: entriesError } = await supabase
      .from("payroll_entries")
      .update({ status: "paid" })
      .eq("period_id", periodId);

    if (entriesError) {
      return NextResponse.json({ success: false, message: entriesError.message }, { status: 500 });
    }
  }

  const { error: auditError } = await supabase.from("payroll_audit_log").insert({
    period_id: periodId,
    user_id: userId,
    action,
    record_type: "period",
    record_id: periodId,
    old_value: { status: fromStatus },
    new_value: { status: toStatus, comment: comment || null },
  });

  if (auditError) {
    return NextResponse.json({ success: false, message: auditError.message }, { status: 500 });
  }

  // Notifications are best-effort — never let a failure here undo the transition above.
  try {
    const label = periodLabel(period);
    if (isReject) {
      await notifyPayrollRoles(
        supabase,
        periodId,
        "payroll_rejected",
        ["admin", "HR_Manager"],
        `Payroll Rejected — ${label}`,
        `Payroll for ${label} was sent back from "${fromStatus.replace(/_/g, " ")}" to "calculated" for correction. Reason: ${comment}`,
      );
    } else if (toStatus === "paid") {
      const { data: entries } = await supabase
        .from("payroll_entries")
        .select("employee_id")
        .eq("period_id", periodId);
      const employeeIds = [...new Set((entries ?? []).map((e) => e.employee_id as string))];
      await notifyPayrollEmployees(
        supabase,
        periodId,
        "payroll_paid",
        employeeIds,
        `Your Salary Has Been Paid — ${label}`,
        `Your salary for ${label} has been paid.`,
      );
    } else {
      const eventType = FORWARD_EVENT_TYPE[toStatus];
      await notifyPayrollRoles(
        supabase,
        periodId,
        eventType,
        ["admin", "HR_Manager"],
        `Payroll ${toStatus.replace(/_/g, " ")} — ${label}`,
        `Payroll for ${label} has moved to status "${toStatus.replace(/_/g, " ")}".`,
      );
    }
  } catch (notifyError) {
    console.error("payroll advance: notification failed", notifyError);
  }

  return NextResponse.json({ success: true, status: toStatus });
}
