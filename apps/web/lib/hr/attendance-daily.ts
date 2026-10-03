// Pure logic that turns one employee's raw facts for one day (logs, shift, holiday, leave,
// approved OT, manual correction) into the attendance_daily row. No database access;
// attendance-daily-service.ts loads the facts and writes the result.
//
// Limitation: logs are bucketed by Phnom Penh calendar date, so a shift that crosses
// midnight is split across two days. No overnight shift is configured today.

import { getBusinessMinutes } from "./attendance";

export interface DailyShift {
  id: string;
  kind: string; // "fixed" | "flexible"
  start_time: string | null; // "HH:MM:SS"
  end_time: string | null;
  break_minutes: number;
  is_overnight: boolean;
  grace_minutes: number;
  work_days: string[]; // "Mon".."Sun"
}

export interface DailyLog {
  log_time: string; // ISO timestamp
  log_type: string; // "check_in" | "check_out"
  is_valid: boolean | null;
  site_id: string | null;
}

export interface DailyManualRecord {
  attendance_type: string;
  hours_worked: number | null;
}

export interface DailyLeave {
  id: string;
  is_half_day: boolean;
}

export interface DailyOtRequest {
  id: string;
  hours: number;
}

export interface DailyInput {
  employeeId: string;
  date: string; // yyyy-mm-dd, Phnom Penh business date
  /** True once the day is over, so a missing log means absent / missing check-out. */
  isFinal: boolean;
  shift: DailyShift | null;
  assignedSiteId: string | null;
  projectId: string | null;
  logs: DailyLog[];
  manual: DailyManualRecord | null;
  isHoliday: boolean;
  leave: DailyLeave | null;
  approvedOt: DailyOtRequest[];
  /** Used as the scheduled day length when there is no fixed shift (payroll_settings.working_time). */
  standardHours: number;
  /** Hours beyond the schedule that are ignored before asking for an OT request. */
  otToleranceHours: number;
}

export interface DailyRow {
  employee_id: string;
  work_date: string;
  shift_id: string | null;
  site_id: string | null;
  project_id: string | null;
  status: string;
  first_in: string | null;
  last_out: string | null;
  worked_hours: number;
  regular_hours: number;
  ot_hours_actual: number;
  late_minutes: number;
  is_holiday: boolean;
  is_rest_day: boolean;
  leave_request_id: string | null;
  ot_request_id: string | null;
  needs_review: boolean;
  review_reason: string | null;
  /** Always "auto" from the builder; the service never overwrites a stored row that HR set to "manual". */
  source: "auto";
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const round2 = (n: number) => Math.round(n * 100) / 100;

export function weekdayOf(date: string): string {
  return WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
}

function minutesOfDay(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Scheduled working hours of a shift, break excluded. Flexible shifts use the standard day. */
export function scheduledHours(shift: DailyShift | null, standardHours: number): number {
  if (!shift || shift.kind !== "fixed" || !shift.start_time || !shift.end_time) return standardHours;
  let span = minutesOfDay(shift.end_time) - minutesOfDay(shift.start_time);
  if (span <= 0 || shift.is_overnight) span += 24 * 60;
  return Math.max(0, (span - shift.break_minutes) / 60);
}

export function isRestDay(date: string, shift: DailyShift | null): boolean {
  const day = weekdayOf(date);
  return shift ? !shift.work_days.includes(day) : day === "Sat" || day === "Sun";
}

function workedHours(firstIn: Date, lastOut: Date, shift: DailyShift | null): number {
  const spanHours = (lastOut.getTime() - firstIn.getTime()) / 3_600_000;
  const breakHours = shift ? shift.break_minutes / 60 : 0;
  // The break is only taken off a long enough stretch, so a short visit is not driven negative.
  return Math.max(0, round2(spanHours >= 5 ? spanHours - breakHours : spanHours));
}

export function buildAttendanceDay(input: DailyInput): DailyRow {
  const { date, shift } = input;
  const reasons: string[] = [];
  const holiday = input.isHoliday;
  const restDay = isRestDay(date, shift);
  const nonWorking = holiday || restDay;

  const valid = input.logs
    .filter((l) => l.is_valid !== false)
    .sort((a, b) => new Date(a.log_time).getTime() - new Date(b.log_time).getTime());
  const ins = valid.filter((l) => l.log_type === "check_in");
  const outs = valid.filter((l) => l.log_type === "check_out");
  const firstInLog = ins[0] ?? null;
  const lastOutLog = firstInLog ? [...outs].reverse().find((l) => l.log_time > firstInLog.log_time) ?? null : null;
  const firstIn = firstInLog ? new Date(firstInLog.log_time) : null;
  const lastOut = lastOutLog ? new Date(lastOutLog.log_time) : null;

  const hasLogs = firstIn !== null;
  let worked = firstIn && lastOut ? workedHours(firstIn, lastOut, shift) : 0;
  if (!hasLogs && input.manual?.hours_worked) worked = round2(Number(input.manual.hours_worked));

  if (input.logs.length > 0 && valid.length === 0) reasons.push("Only invalid attendance logs");
  if (firstIn && !lastOut && input.isFinal) reasons.push("Missing check-out");

  // Hours the employee is expected to work, then split into regular and beyond-schedule.
  let scheduled = nonWorking ? 0 : scheduledHours(shift, input.standardHours);
  if (input.leave) scheduled = input.leave.is_half_day ? scheduled / 2 : 0;
  const regular = round2(Math.min(worked, scheduled));
  const beyond = round2(Math.max(0, worked - scheduled));

  // Beyond-schedule hours count as OT only up to what was approved.
  const approvedHours = round2(input.approvedOt.reduce((sum, o) => sum + Number(o.hours || 0), 0));
  const otActual = round2(Math.min(beyond, approvedHours));
  if (beyond > input.otToleranceHours && approvedHours === 0) {
    reasons.push(`Worked ${beyond}h beyond the schedule without an approved OT request`);
  } else if (approvedHours > 0 && input.isFinal && otActual < approvedHours) {
    reasons.push(`Approved OT ${approvedHours}h but only ${otActual}h worked beyond the schedule`);
  }

  // Late arrival, counted from the shift start once the grace period is used up.
  let lateMinutes = 0;
  if (firstIn && shift?.kind === "fixed" && shift.start_time && !nonWorking && !input.leave) {
    const start = minutesOfDay(shift.start_time);
    const arrived = getBusinessMinutes(firstIn);
    if (arrived > start + shift.grace_minutes) lateMinutes = arrived - start;
  }

  if (firstInLog && input.assignedSiteId && firstInLog.site_id && firstInLog.site_id !== input.assignedSiteId) {
    reasons.push("Checked in at a site that is not assigned to the employee");
  }
  if (input.leave && hasLogs && !input.leave.is_half_day) reasons.push("Attendance recorded on an approved leave day");
  if (input.leave?.is_half_day && !hasLogs && input.isFinal) reasons.push("Half-day leave but no attendance for the rest of the day");

  // Status: a manual correction wins, then leave, holiday, rest day, attendance, absence.
  let status: string;
  if (input.manual) status = input.manual.attendance_type.toUpperCase();
  else if (input.leave && !(input.leave.is_half_day && hasLogs)) status = "LEAVE";
  else if (holiday) status = "HOLIDAY";
  else if (restDay && !hasLogs) status = "REST_DAY";
  else if (hasLogs) status = lateMinutes > 0 ? "LATE" : "PRESENT";
  else status = input.isFinal ? "ABSENT" : "PENDING";

  return {
    employee_id: input.employeeId,
    work_date: date,
    shift_id: shift?.id ?? null,
    site_id: firstInLog?.site_id ?? input.assignedSiteId,
    project_id: input.projectId,
    status,
    first_in: firstIn ? firstIn.toISOString() : null,
    last_out: lastOut ? lastOut.toISOString() : null,
    worked_hours: worked,
    regular_hours: regular,
    ot_hours_actual: otActual,
    late_minutes: lateMinutes,
    is_holiday: holiday,
    is_rest_day: restDay,
    leave_request_id: input.leave?.id ?? null,
    ot_request_id: input.approvedOt[0]?.id ?? null,
    needs_review: reasons.length > 0,
    review_reason: reasons.length > 0 ? reasons.join("; ") : null,
    source: "auto",
  };
}
