import { describe, expect, it } from "vitest";
import { attendanceDeduction, summariseMonth, type LeaveInfo, type MonthDayRow } from "../payroll-attendance";

const row = (over: Partial<MonthDayRow> = {}): MonthDayRow => ({
  status: "PRESENT", ot_hours_actual: 0, is_holiday: false, is_rest_day: false,
  needs_review: false, review_resolved_at: null, leave_request_id: null, ot_type: null, ...over,
});
const NO_LEAVE = new Map<string, LeaveInfo>();

describe("summariseMonth", () => {
  it("counts working, present and absent days, ignoring rest days and holidays", () => {
    const s = summariseMonth(
      [row(), row({ status: "LATE" }), row({ status: "ABSENT" }), row({ status: "HOLIDAY", is_holiday: true }), row({ status: "REST_DAY", is_rest_day: true })],
      NO_LEAVE,
    );
    expect(s).toMatchObject({ workingDays: 3, presentDays: 2, absentDays: 1, rows: 5 });
  });

  it("splits leave into paid and unpaid by leave type", () => {
    const leaves = new Map<string, LeaveInfo>([
      ["annual", { is_paid: true, is_half_day: false }],
      ["unpaid", { is_paid: false, is_half_day: false }],
    ]);
    const s = summariseMonth(
      [row({ status: "LEAVE", leave_request_id: "annual" }), row({ status: "LEAVE", leave_request_id: "unpaid" }), row({ status: "LEAVE", leave_request_id: "unpaid" })],
      leaves,
    );
    expect(s).toMatchObject({ paidLeaveDays: 1, unpaidLeaveDays: 2, leaveDays: 3, absentDays: 0 });
  });

  it("treats a half-day leave worked in the other half as half present, half leave", () => {
    const leaves = new Map([["h", { is_paid: false, is_half_day: true }]]);
    const s = summariseMonth([row({ status: "PRESENT", leave_request_id: "h" })], leaves);
    expect(s).toMatchObject({ presentDays: 0.5, unpaidLeaveDays: 0.5, absentDays: 0 });
  });

  it("counts the unworked half of a half-day leave as absence", () => {
    const leaves = new Map([["h", { is_paid: true, is_half_day: true }]]);
    const s = summariseMonth([row({ status: "LEAVE", leave_request_id: "h" })], leaves);
    expect(s).toMatchObject({ paidLeaveDays: 0.5, absentDays: 0.5 });
  });

  it("sums matched OT hours by type and groups untyped OT", () => {
    const s = summariseMonth(
      [
        row({ ot_hours_actual: 2, ot_type: "weekday" }),
        row({ ot_hours_actual: 1.5, ot_type: "weekday" }),
        row({ ot_hours_actual: 4, ot_type: "weekend", is_rest_day: true }),
        row({ ot_hours_actual: 1, ot_type: null }),
      ],
      NO_LEAVE,
    );
    expect(s.otHoursByType).toEqual({ weekday: 3.5, weekend: 4, unspecified: 1 });
  });

  it("counts unresolved review days and pending days", () => {
    const s = summariseMonth(
      [row({ needs_review: true }), row({ needs_review: true, review_resolved_at: "2026-10-01T00:00:00Z" }), row({ status: "PENDING" })],
      NO_LEAVE,
    );
    expect(s).toMatchObject({ reviewDays: 1, pendingDays: 1 });
  });

  it("does not count work on a rest day as a present day", () => {
    expect(summariseMonth([row({ is_rest_day: true, ot_hours_actual: 5, ot_type: "weekend" })], NO_LEAVE).presentDays).toBe(0);
  });
});

describe("attendanceDeduction", () => {
  const summary = summariseMonth(
    [row({ status: "ABSENT" }), row({ status: "ABSENT" }), row({ status: "LEAVE", leave_request_id: "u" })],
    new Map([["u", { is_paid: false, is_half_day: false }]]),
  );

  it("deducts nothing until HR turns it on", () => {
    expect(attendanceDeduction(summary, null, 30)).toEqual({ days: 0, amount: 0 });
    expect(attendanceDeduction(summary, { enabled: false }, 30)).toEqual({ days: 0, amount: 0 });
  });

  it("deducts unpaid leave and absence at the daily rate when enabled", () => {
    expect(attendanceDeduction(summary, { enabled: true }, 30)).toEqual({ days: 3, amount: 90 });
  });

  it("honours the per-kind switches", () => {
    expect(attendanceDeduction(summary, { enabled: true, deduct_absence: false }, 30)).toEqual({ days: 1, amount: 30 });
    expect(attendanceDeduction(summary, { enabled: true, deduct_unpaid_leave: false }, 30)).toEqual({ days: 2, amount: 60 });
  });
});
