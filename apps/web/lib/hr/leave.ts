import { SupabaseClient } from "@supabase/supabase-js";
import { eachDayOfInterval, format, isBefore, parseISO } from "date-fns";
import { resolveApprovalChain } from "@/lib/hr/approval-chain";
import {
  computeLeaveDays,
  getDefaultDaySelections,
  getSelectedDates,
  type DaySelection,
} from "@/lib/hr/leave-day-calculation";

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

// ── Apply (create) leave request ────────────────────────────────────────────
//
// Ports the validation + submit logic that today lives ONLY client-side in
// `apps/web/components/hr/leave/leave-request-form.tsx` (`validate()` +
// `handleSubmit`), so the Telegram Mini App (and any other non-browser
// caller) gets the same business rules enforced server-side. Every check
// below is annotated with the line range it was sourced from in that file.

export interface LeaveApplicantProfile {
  id: string;
  full_name: string | null;
  gender: string | null;
  probation_status: string | null;
  employment_type: string | null;
}

export async function getLeaveApplicantProfile(
  admin: SupabaseClient,
  employeeId: string,
): Promise<LeaveApplicantProfile | null> {
  const { data } = await admin
    .from("profiles")
    .select("id, full_name, gender, probation_status, employment_type")
    .eq("id", employeeId)
    .maybeSingle();

  return (data as LeaveApplicantProfile | null) ?? null;
}

export interface ApplicableLeaveType {
  id: string;
  leave_code: string;
  leave_name: string;
  max_days_per_year: number;
  is_paid: boolean;
  half_day_allowed: boolean;
  skip_team_capacity: boolean;
  max_days_per_request: number;
  advance_notice_days: number;
  probation_required: boolean;
  gender_restriction: string;
  is_replacement_leave: boolean;
  requires_document: boolean;
  is_active: boolean;
}

// Column set mirrors leave-request-form.tsx lines 208-210 exactly.
const LEAVE_TYPE_COLUMNS =
  "id, leave_code, leave_name, max_days_per_year, is_paid, half_day_allowed, skip_team_capacity, max_days_per_request, advance_notice_days, probation_required, gender_restriction, is_replacement_leave, requires_document, is_active";

export async function getActiveLeaveTypes(admin: SupabaseClient): Promise<ApplicableLeaveType[]> {
  const { data } = await admin
    .from("leave_types")
    .select(LEAVE_TYPE_COLUMNS)
    .eq("is_active", true)
    .order("leave_name");

  return (data ?? []) as unknown as ApplicableLeaveType[];
}

export interface LeaveEmploymentPolicy {
  leave_type_id: string;
  allowed: boolean;
  requires_hr: boolean;
  requires_attachment: boolean;
  monthly_accrual: boolean;
  usable: boolean;
}

// Bulk equivalent of the form's per-type `leave_employment_policy` fetch
// (lines 290-301) — one query covering every leave type for the applicant's
// (employment_type, probation_status) combination instead of one round trip
// per selected type.
export async function getLeaveEmploymentPolicies(
  admin: SupabaseClient,
  employmentType: string,
  probationStatus: string,
): Promise<LeaveEmploymentPolicy[]> {
  const { data } = await admin
    .from("leave_employment_policy")
    .select("leave_type_id, allowed, requires_hr, requires_attachment, monthly_accrual, usable")
    .eq("employment_type", employmentType)
    .eq("probation_status", probationStatus);

  return (data ?? []) as unknown as LeaveEmploymentPolicy[];
}

export interface LeaveDateRange {
  start_date: string;
  end_date: string;
}

// Blocking statuses mirror leave-request-form.tsx line 236 exactly — a
// leave request only frees up its dates once it leaves this set (rejected,
// cancelled, withdrawn).
const BLOCKING_LEAVE_STATUSES = ["submitted", "approved", "pending_cancellation"];

export async function getOccupiedLeaveRanges(
  admin: SupabaseClient,
  employeeId: string,
): Promise<LeaveDateRange[]> {
  const { data } = await admin
    .from("leave_requests")
    .select("start_date, end_date")
    .eq("employee_id", employeeId)
    .in("status", BLOCKING_LEAVE_STATUSES);

  return (data ?? []) as LeaveDateRange[];
}

async function getOccupiedLeaveDateSet(admin: SupabaseClient, employeeId: string): Promise<Set<string>> {
  const ranges = await getOccupiedLeaveRanges(admin, employeeId);
  const occupied = new Set<string>();
  for (const range of ranges) {
    for (const day of getSelectedDates(range.start_date, range.end_date)) {
      occupied.add(format(day, "yyyy-MM-dd"));
    }
  }
  return occupied;
}

export async function getActivePublicHolidayDates(
  admin: SupabaseClient,
  years: number[],
): Promise<Set<string>> {
  if (years.length === 0) return new Set();
  const { data } = await admin
    .from("leave_public_holidays")
    .select("holiday_date")
    .in("year", years)
    .eq("is_active", true);

  return new Set(((data ?? []) as { holiday_date: string }[]).map((h) => h.holiday_date));
}

export interface CreateLeaveRequestInput {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  /** Optional per-day overrides; unlisted days default per getDefaultDaySelections. */
  daySelections?: Record<string, DaySelection>;
  reason: string;
}

// Distinct failure modes, one per specific check the form performs in
// validate() — deliberately not collapsed into a generic catch-all so a
// caller can react (or localize a message) per rule.
export type CreateLeaveRequestError =
  | "invalid_leave_type"
  | "validation_error"
  | "gender_restricted"
  | "probation_not_allowed"
  | "probation_requires_hr"
  | "insufficient_balance"
  | "max_days_exceeded"
  | "half_day_not_allowed"
  | "date_conflict";

export type CreateLeaveRequestResult =
  | { ok: true; requestId: string }
  | { ok: false; error: CreateLeaveRequestError; message: string };

async function notifyLeaveApprover(
  admin: SupabaseClient,
  params: {
    requestId: string;
    approverId: string;
    employeeName: string;
    daysRequested: number;
    startDate: string;
    endDate: string;
    reason: string;
  },
): Promise<void> {
  const { data: approverProfileData } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", params.approverId)
    .maybeSingle();
  const approverProfile = approverProfileData as { full_name: string | null; email: string | null } | null;

  // Message format mirrors notifyApprover in leave-request-form.tsx (lines 365-396).
  const body = `${params.employeeName} has submitted a leave request for ${params.daysRequested} day(s) from ${format(parseISO(params.startDate), "dd MMM yyyy")} to ${format(parseISO(params.endDate), "dd MMM yyyy")}. Reason: ${params.reason}`;

  await admin.from("leave_notifications").insert({
    leave_request_id: params.requestId,
    event_type: "request_submitted",
    recipient_id: params.approverId,
    recipient_email: approverProfile?.email,
    recipient_name: approverProfile?.full_name,
    subject: `Leave Request from ${params.employeeName}`,
    body,
  });

  await insertLeaveTaskAlert(admin, {
    recipientId: params.approverId,
    alertType: "leave_pending_approval",
    title: `Leave Request from ${params.employeeName}`,
    body,
    leaveRequestId: params.requestId,
  });
}

export async function createLeaveRequest(
  admin: SupabaseClient,
  employeeId: string,
  input: CreateLeaveRequestInput,
): Promise<CreateLeaveRequestResult> {
  const { leaveTypeId, startDate, endDate, reason } = input;

  // BR: leave-request-form.tsx lines 306-308 — required dates, end >= start.
  if (!startDate) return { ok: false, error: "validation_error", message: "Please select a start date." };
  if (!endDate) return { ok: false, error: "validation_error", message: "Please select an end date." };
  if (isBefore(parseISO(endDate), parseISO(startDate))) {
    return { ok: false, error: "validation_error", message: "End date cannot be before start date." };
  }

  const profile = await getLeaveApplicantProfile(admin, employeeId);
  if (!profile) {
    return {
      ok: false,
      error: "validation_error",
      message: "Unable to identify current user. Please refresh and try again.",
    };
  }

  // BR: leave-request-form.tsx line 305 — leave type must exist and be
  // selectable. The form only ever offers active types in its dropdown
  // (line 210's `.eq("is_active", true)`), so an inactive/unknown id here
  // is treated the same way validate() treats "no type selected".
  const { data: leaveTypeData } = await admin
    .from("leave_types")
    .select(LEAVE_TYPE_COLUMNS)
    .eq("id", leaveTypeId)
    .eq("is_active", true)
    .maybeSingle();
  const leaveType = (leaveTypeData as unknown as ApplicableLeaveType) ?? null;
  if (!leaveType) {
    return { ok: false, error: "invalid_leave_type", message: "Please select a leave type." };
  }

  // BR: leave-request-form.tsx lines 311-315 — gender restriction.
  if (leaveType.gender_restriction !== "all") {
    const userGender = profile.gender || "all";
    if (userGender !== leaveType.gender_restriction) {
      return {
        ok: false,
        error: "gender_restricted",
        message: `This leave type is only available for ${leaveType.gender_restriction} employees.`,
      };
    }
  }

  // Public holidays covering the requested range — mirrors the form's
  // initial-load holiday fetch (lines 212-216), scoped to whichever years
  // the request actually spans rather than a hardcoded current/next year.
  const rangeDates = getSelectedDates(startDate, endDate);
  const years = [...new Set(rangeDates.map((d) => d.getFullYear()))];
  const holidays = await getActivePublicHolidayDates(admin, years);

  const effectiveDaySelections = getDefaultDaySelections(startDate, endDate, input.daySelections ?? {}, holidays);
  const calc = computeLeaveDays(startDate, endDate, effectiveDaySelections, holidays);

  // BR: leave-request-form.tsx line 309 — days requested must be > 0.
  if (calc.daysRequested <= 0) {
    return { ok: false, error: "validation_error", message: "Days requested must be greater than 0." };
  }

  // BR: leave-request-form.tsx lines 317-322 — probation-period policy.
  // Only consulted when the employee is currently on active probation, same
  // gate as the form (`currentUser?.probation_status === "active" && employmentPolicy`).
  if (profile.probation_status === "active") {
    const { data: policyData } = await admin
      .from("leave_employment_policy")
      .select("allowed, requires_hr")
      .eq("employment_type", profile.employment_type ?? "permanent")
      .eq("probation_status", profile.probation_status ?? "not_applicable")
      .eq("leave_type_id", leaveType.id)
      .maybeSingle();
    const employmentPolicy = policyData as { allowed: boolean; requires_hr: boolean } | null;

    if (employmentPolicy) {
      if (!employmentPolicy.allowed) {
        return {
          ok: false,
          error: "probation_not_allowed",
          message: `${leaveType.leave_name} cannot be used during probation period. Please contact HR.`,
        };
      }
      if (employmentPolicy.requires_hr) {
        return {
          ok: false,
          error: "probation_requires_hr",
          message: `${leaveType.leave_name} requires HR approval during probation period. Your request will be flagged for HR review.`,
        };
      }
    }
  }

  // BR: leave-request-form.tsx lines 324-328 — balance sufficiency
  // (replacement leave is exempt, same as `!selectedType.is_replacement_leave`).
  if (!leaveType.is_replacement_leave) {
    const currentYear = new Date().getFullYear();
    const { data: balanceData } = await admin
      .from("leave_balances")
      .select("remaining_days")
      .eq("employee_id", employeeId)
      .eq("leave_type_id", leaveType.id)
      .eq("fiscal_year", currentYear)
      .maybeSingle();
    // BR: leave-request-form.tsx line 325 — the actual submission-blocking
    // check falls back to 0 when no balance row exists yet. (Line 184's
    // `availableBalance` uses a different, more lenient fallback to
    // `max_days_per_year`, but that memo only feeds the UI's balance-meter
    // display, not `validate()` — this mirrors `validate()`, not the meter.)
    const remainingBalance = (balanceData as { remaining_days: number } | null)?.remaining_days ?? 0;

    if (calc.daysRequested > remainingBalance) {
      return {
        ok: false,
        error: "insufficient_balance",
        message: `Insufficient balance. You have ${remainingBalance} day${remainingBalance !== 1 ? "s" : ""} remaining.`,
      };
    }
  }

  // BR: leave-request-form.tsx lines 330-331 — per-request cap (0 = unlimited).
  if (leaveType.max_days_per_request > 0 && calc.daysRequested > leaveType.max_days_per_request) {
    return {
      ok: false,
      error: "max_days_exceeded",
      message: `Maximum ${leaveType.max_days_per_request} days per request allowed.`,
    };
  }

  // BR: leave-request-form.tsx lines 333-334 — half-day must be allowed for this type.
  if (calc.isHalfDay && !leaveType.half_day_allowed) {
    return { ok: false, error: "half_day_not_allowed", message: "Half-day leave is not allowed for this leave type." };
  }

  // BR: leave-request-form.tsx line 336 — reason required. Also enforced by
  // LeaveApplySchema at the API boundary; kept here too since this function
  // is a public service-layer entry point other callers may use directly.
  if (!reason.trim()) {
    return { ok: false, error: "validation_error", message: "Please provide a reason for your leave request." };
  }

  // BR: leave-request-form.tsx lines 338-347 — date conflict against the
  // employee's own active leave requests, only for days actually being
  // requested (skip-marked days never conflict).
  const occupied = await getOccupiedLeaveDateSet(admin, employeeId);
  const conflictKeys = calc.requestableDateKeys.filter((key) => {
    const selection = effectiveDaySelections[key] ?? "full";
    return selection !== "skip" && occupied.has(key);
  });
  if (conflictKeys.length > 0) {
    const formatted = conflictKeys.map((key) => format(parseISO(key), "dd MMM yyyy"));
    return {
      ok: false,
      error: "date_conflict",
      message: `You already have a leave request on: ${formatted.join(", ")}. Please select different dates.`,
    };
  }

  // Approver resolution — identical call to resolveApprovers() (lines 353-362).
  const chain = await resolveApprovalChain(admin, employeeId);
  const approver1Id = chain.firstApprover?.id ?? null;
  const approver2IdRaw = chain.finalApprover?.id ?? null;
  const approver2Id = approver2IdRaw && approver2IdRaw !== approver1Id ? approver2IdRaw : null;

  // Insert — same shape/status as handleSubmit's insert (lines 411-431).
  const { data: request, error: insertError } = await admin
    .from("leave_requests")
    .insert({
      employee_id: employeeId,
      requested_by_id: employeeId,
      leave_type_id: leaveType.id,
      start_date: startDate,
      end_date: endDate,
      days_requested: calc.daysRequested,
      is_half_day: calc.isSingleHalfDayRequest,
      half_day_period: calc.isSingleHalfDayRequest ? calc.halfDayPeriod : null,
      reason,
      status: "submitted",
      submission_date: new Date().toISOString(),
      approver_1_id: approver1Id,
      approver_1_status: approver1Id ? "pending" : null,
      approver_2_id: approver2Id,
      approver_2_status: approver2Id ? "pending" : null,
    })
    .select("id")
    .single();

  if (insertError || !request) {
    throw new Error(insertError?.message ?? "Failed to create leave request");
  }

  // Notify only the first approver — the second is notified when the first
  // approves (see decideLeaveRequest's forwarding branch above), same as
  // the form's comment at lines 436-438.
  if (approver1Id) {
    await notifyLeaveApprover(admin, {
      requestId: request.id as string,
      approverId: approver1Id,
      employeeName: profile.full_name ?? "Unknown",
      daysRequested: calc.daysRequested,
      startDate,
      endDate,
      reason,
    });
  }

  return { ok: true, requestId: request.id as string };
}
