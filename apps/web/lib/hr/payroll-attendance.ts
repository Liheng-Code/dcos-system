// Turns a month of attendance_daily rows into the numbers payroll needs: days worked, leave
// (paid / unpaid), absence, and OT hours by type. Pure; the payroll run loads the rows.
//
// OT is counted from ot_hours_actual, which the daily builder caps at the hours HR approved,
// so approved-but-not-worked and worked-but-not-approved hours are never paid.

export interface MonthDayRow {
  status: string;
  ot_hours_actual: number;
  is_holiday: boolean;
  is_rest_day: boolean;
  needs_review: boolean;
  review_resolved_at: string | null;
  leave_request_id: string | null;
  /** overtime_rates.ot_type of the linked approved OT request. */
  ot_type: string | null;
}

export interface LeaveInfo {
  is_paid: boolean;
  is_half_day: boolean;
}

export interface AttendanceMonthSummary {
  workingDays: number;
  presentDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  absentDays: number;
  leaveDays: number;
  otHoursByType: Record<string, number>;
  /** Days still flagged for review and not resolved by HR. */
  reviewDays: number;
  /** Days with no outcome yet (today or later). */
  pendingDays: number;
  rows: number;
}

export const PRESENT_STATUSES = new Set(["PRESENT", "LATE", "WFH", "SITE_WORK", "BUSINESS_TRIP"]);
export const UNSPECIFIED_OT_TYPE = "unspecified";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function summariseMonth(rows: MonthDayRow[], leaveById: Map<string, LeaveInfo>): AttendanceMonthSummary {
  const s: AttendanceMonthSummary = {
    workingDays: 0, presentDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, absentDays: 0,
    leaveDays: 0, otHoursByType: {}, reviewDays: 0, pendingDays: 0, rows: rows.length,
  };

  for (const row of rows) {
    const status = row.status.toUpperCase();
    const workingDay = !row.is_holiday && !row.is_rest_day;
    const leave = row.leave_request_id ? leaveById.get(row.leave_request_id) ?? { is_paid: true, is_half_day: false } : null;
    const addLeave = (days: number) => {
      if (leave?.is_paid === false) s.unpaidLeaveDays += days; else s.paidLeaveDays += days;
    };

    if (workingDay) {
      s.workingDays++;
      if (status === "PENDING") s.pendingDays++;
      else if (status === "LEAVE") {
        addLeave(leave?.is_half_day ? 0.5 : 1);
        if (leave?.is_half_day) s.absentDays += 0.5; // the other half has no attendance
      } else if (PRESENT_STATUSES.has(status)) {
        if (leave?.is_half_day) { addLeave(0.5); s.presentDays += 0.5; } else s.presentDays++;
      } else if (status === "ABSENT") s.absentDays++;
    }

    if (row.ot_hours_actual > 0) {
      const type = row.ot_type ?? UNSPECIFIED_OT_TYPE;
      s.otHoursByType[type] = round2((s.otHoursByType[type] ?? 0) + Number(row.ot_hours_actual));
    }
    if (row.needs_review && !row.review_resolved_at) s.reviewDays++;
  }

  s.leaveDays = round2(s.paidLeaveDays + s.unpaidLeaveDays);
  s.presentDays = round2(s.presentDays);
  s.paidLeaveDays = round2(s.paidLeaveDays);
  s.unpaidLeaveDays = round2(s.unpaidLeaveDays);
  s.absentDays = round2(s.absentDays);
  return s;
}

export interface AttendanceDeductionSetting {
  enabled: boolean;
  deduct_unpaid_leave: boolean;
  deduct_absence: boolean;
}

export const DEFAULT_ATTENDANCE_DEDUCTION: AttendanceDeductionSetting = {
  enabled: false,
  deduct_unpaid_leave: true,
  deduct_absence: true,
};

/**
 * Days to deduct and the amount, at `dailyRate` per day. Zero unless HR has switched the
 * setting on (payroll_settings key attendance_deduction).
 */
export function attendanceDeduction(
  summary: AttendanceMonthSummary,
  setting: Partial<AttendanceDeductionSetting> | null | undefined,
  dailyRate: number,
): { days: number; amount: number } {
  const cfg = { ...DEFAULT_ATTENDANCE_DEDUCTION, ...(setting ?? {}) };
  if (!cfg.enabled) return { days: 0, amount: 0 };
  const days = (cfg.deduct_unpaid_leave ? summary.unpaidLeaveDays : 0) + (cfg.deduct_absence ? summary.absentDays : 0);
  return { days: round2(days), amount: round2(days * dailyRate) };
}
