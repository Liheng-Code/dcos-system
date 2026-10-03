import { describe, expect, it } from "vitest";
import {
  buildAttendanceDay,
  isRestDay,
  scheduledHours,
  weekdayOf,
  type DailyInput,
  type DailyLog,
  type DailyShift,
} from "../attendance-daily";

const OFFICE: DailyShift = {
  id: "office", kind: "fixed", start_time: "08:00:00", end_time: "17:00:00",
  break_minutes: 60, is_overnight: false, grace_minutes: 15,
  work_days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
};
const FLEX: DailyShift = { ...OFFICE, id: "flex", kind: "flexible", start_time: null, end_time: null };

// 2026-10-05 is a Monday, 2026-10-10 a Saturday. Times are Phnom Penh (+07:00).
const MON = "2026-10-05";
const SAT = "2026-10-10";
const at = (date: string, hhmm: string) => `${date}T${hhmm}:00+07:00`;
const inLog = (date: string, hhmm: string, site: string | null = null): DailyLog =>
  ({ log_time: at(date, hhmm), log_type: "check_in", is_valid: true, site_id: site });
const outLog = (date: string, hhmm: string): DailyLog =>
  ({ log_time: at(date, hhmm), log_type: "check_out", is_valid: true, site_id: null });

function day(over: Partial<DailyInput> = {}): ReturnType<typeof buildAttendanceDay> {
  return buildAttendanceDay({
    employeeId: "e1", date: MON, isFinal: true, shift: OFFICE, assignedSiteId: null, projectId: null,
    logs: [], manual: null, isHoliday: false, leave: null, approvedOt: [],
    standardHours: 8, otToleranceHours: 0.25,
    ...over,
  });
}

describe("calendar helpers", () => {
  it("finds the weekday and rest days", () => {
    expect(weekdayOf(MON)).toBe("Mon");
    expect(isRestDay(MON, OFFICE)).toBe(false);
    expect(isRestDay(SAT, OFFICE)).toBe(true);
    expect(isRestDay(SAT, null)).toBe(true);
  });

  it("computes scheduled hours without the break; flexible uses the standard day", () => {
    expect(scheduledHours(OFFICE, 8)).toBe(8);
    expect(scheduledHours(FLEX, 7.5)).toBe(7.5);
    expect(scheduledHours(null, 8)).toBe(8);
  });
});

describe("a normal working day", () => {
  it("is PRESENT with regular hours when the shift is fully worked", () => {
    const r = day({ logs: [inLog(MON, "07:55"), outLog(MON, "17:05")] });
    expect(r.status).toBe("PRESENT");
    expect(r.worked_hours).toBe(8.17);
    expect(r.regular_hours).toBe(8);
    expect(r.ot_hours_actual).toBe(0);
    expect(r.needs_review).toBe(false);
  });

  it("is LATE only after the grace period, counted from shift start", () => {
    expect(day({ logs: [inLog(MON, "08:14"), outLog(MON, "17:30")] }).status).toBe("PRESENT");
    const late = day({ logs: [inLog(MON, "08:30"), outLog(MON, "17:30")] });
    expect(late.status).toBe("LATE");
    expect(late.late_minutes).toBe(30);
  });

  it("is ABSENT when the day is over with no logs, PENDING while it is still running", () => {
    expect(day().status).toBe("ABSENT");
    expect(day({ isFinal: false }).status).toBe("PENDING");
  });

  it("flags a missing check-out once the day is final", () => {
    const r = day({ logs: [inLog(MON, "08:00")] });
    expect(r.needs_review).toBe(true);
    expect(r.review_reason).toContain("Missing check-out");
    expect(day({ logs: [inLog(MON, "08:00")], isFinal: false }).needs_review).toBe(false);
  });

  it("ignores invalid logs and says so when nothing valid is left", () => {
    const r = day({ logs: [{ ...inLog(MON, "08:00"), is_valid: false }] });
    expect(r.status).toBe("ABSENT");
    expect(r.review_reason).toContain("invalid");
  });
});

describe("overtime matching", () => {
  const long = [inLog(MON, "08:00"), outLog(MON, "20:00")]; // 11h worked after break, 3h beyond

  it("flags hours beyond the schedule that have no approved request", () => {
    const r = day({ logs: long });
    expect(r.ot_hours_actual).toBe(0);
    expect(r.needs_review).toBe(true);
    expect(r.review_reason).toContain("without an approved OT request");
  });

  it("counts OT up to the approved hours and links the request", () => {
    const r = day({ logs: long, approvedOt: [{ id: "ot1", hours: 2 }] });
    expect(r.ot_hours_actual).toBe(2);
    expect(r.ot_request_id).toBe("ot1");
  });

  it("flags approved OT that was not fully worked", () => {
    const r = day({ logs: [inLog(MON, "08:00"), outLog(MON, "18:00")], approvedOt: [{ id: "ot1", hours: 3 }] });
    expect(r.ot_hours_actual).toBe(1);
    expect(r.review_reason).toContain("Approved OT 3h but only 1h");
  });

  it("tolerates a few minutes beyond the schedule", () => {
    expect(day({ logs: [inLog(MON, "08:00"), outLog(MON, "17:10")] }).needs_review).toBe(false);
  });

  it("treats all hours on a rest day as beyond-schedule", () => {
    const r = day({ date: SAT, logs: [inLog(SAT, "08:00"), outLog(SAT, "14:00")], approvedOt: [{ id: "ot1", hours: 5 }] });
    expect(r.is_rest_day).toBe(true);
    expect(r.regular_hours).toBe(0);
    expect(r.ot_hours_actual).toBe(5);
    expect(r.status).toBe("PRESENT");
  });
});

describe("leave, holiday and rest days", () => {
  it("is LEAVE on an approved leave day and links the request", () => {
    const r = day({ leave: { id: "l1", is_half_day: false } });
    expect(r.status).toBe("LEAVE");
    expect(r.leave_request_id).toBe("l1");
    expect(r.needs_review).toBe(false);
  });

  it("flags attendance recorded on a full leave day", () => {
    const r = day({ leave: { id: "l1", is_half_day: false }, logs: [inLog(MON, "08:00"), outLog(MON, "17:00")] });
    expect(r.review_reason).toContain("approved leave day");
  });

  it("halves the schedule on a half-day leave worked in the other half", () => {
    const r = day({ leave: { id: "l1", is_half_day: true }, logs: [inLog(MON, "13:00"), outLog(MON, "17:00")] });
    expect(r.status).toBe("PRESENT");
    expect(r.regular_hours).toBe(4);
    expect(r.needs_review).toBe(false);
  });

  it("marks a public holiday, and flags work on it without approved OT", () => {
    expect(day({ isHoliday: true }).status).toBe("HOLIDAY");
    const worked = day({ isHoliday: true, logs: [inLog(MON, "08:00"), outLog(MON, "12:00")] });
    expect(worked.status).toBe("HOLIDAY");
    expect(worked.review_reason).toContain("without an approved OT request");
  });

  it("marks an unworked rest day as REST_DAY, not absent", () => {
    expect(day({ date: SAT }).status).toBe("REST_DAY");
  });
});

describe("site and manual correction", () => {
  it("flags a check-in at an unassigned site", () => {
    const r = day({ assignedSiteId: "siteA", logs: [inLog(MON, "08:00", "siteB"), outLog(MON, "17:00")] });
    expect(r.site_id).toBe("siteB");
    expect(r.review_reason).toContain("not assigned");
  });

  it("falls back to the assigned site when logs carry none", () => {
    expect(day({ assignedSiteId: "siteA", logs: [inLog(MON, "08:00"), outLog(MON, "17:00")] }).site_id).toBe("siteA");
  });

  it("uses a manual attendance record for status and hours when there are no logs", () => {
    const r = day({ manual: { attendance_type: "business_trip", hours_worked: 8 } });
    expect(r.status).toBe("BUSINESS_TRIP");
    expect(r.worked_hours).toBe(8);
    expect(r.needs_review).toBe(false);
  });
});
