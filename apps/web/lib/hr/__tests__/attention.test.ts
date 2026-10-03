import { describe, expect, it } from "vitest";
import { classifyReviewReason, setupGaps, type SetupState } from "../attention";
import { matchEmployeeByPhone, normalisePhone } from "../phone";

describe("normalisePhone", () => {
  it("reduces the usual Cambodian spellings to the same national number", () => {
    const forms = ["+855 12 503 6303", "012 503 6303", "855125036303", "0125036303", "+855-12-5036303", "00855 12 503 6303"];
    for (const f of forms) expect(normalisePhone(f)).toBe("125036303");
  });

  it("returns empty for missing or too-short numbers", () => {
    expect(normalisePhone(null)).toBe("");
    expect(normalisePhone("")).toBe("");
    expect(normalisePhone("12345")).toBe("");
  });
});

describe("matchEmployeeByPhone", () => {
  const staff = [
    { id: "a", phone: "+855 12 503 6303" },
    { id: "b", phone: "089 022 1230" },
    { id: "c", phone: null },
  ];

  it("matches exactly one employee across formats", () => {
    expect(matchEmployeeByPhone("+855125036303", staff)).toEqual({ kind: "match", employeeId: "a" });
    expect(matchEmployeeByPhone("+855890221230", staff)).toEqual({ kind: "match", employeeId: "b" });
  });

  it("reports none when nothing matches or the number is unusable", () => {
    expect(matchEmployeeByPhone("+855 99 000 0000", staff)).toEqual({ kind: "none" });
    expect(matchEmployeeByPhone("123", staff)).toEqual({ kind: "none" });
  });

  it("reports multiple when two employees share the number, never guessing", () => {
    const dup = [...staff, { id: "d", phone: "012503 6303" }];
    expect(matchEmployeeByPhone("+855125036303", dup)).toEqual({ kind: "multiple", employeeIds: ["a", "d"] });
  });
});

describe("classifyReviewReason", () => {
  it("classifies each reason the daily builder produces", () => {
    expect(classifyReviewReason("Missing check-out")).toEqual(["missing_checkout"]);
    expect(classifyReviewReason("Worked 3h beyond the schedule without an approved OT request")).toEqual(["ot_not_approved"]);
    expect(classifyReviewReason("Approved OT 3h but only 1h worked beyond the schedule")).toEqual(["ot_not_worked"]);
    expect(classifyReviewReason("Attendance recorded on an approved leave day")).toEqual(["leave_overlap"]);
    expect(classifyReviewReason("Half-day leave but no attendance for the rest of the day")).toEqual(["half_day"]);
    expect(classifyReviewReason("Checked in at a site that is not assigned to the employee")).toEqual(["site_mismatch"]);
    expect(classifyReviewReason("Only invalid attendance logs")).toEqual(["invalid_logs"]);
  });

  it("handles several reasons on one day and unknown text", () => {
    expect(classifyReviewReason("Missing check-out; Something new")).toEqual(["missing_checkout", "other"]);
    expect(classifyReviewReason(null)).toEqual([]);
  });
});

describe("setupGaps", () => {
  const complete: SetupState = {
    employmentCategory: "site_staff", laborCategory: "site_staff", hasReportingManager: true, hasShift: true,
    hasPayrollProfile: true, hasTaxProfile: true, hasNssfProfile: true, hasBankAccount: true, hasSalaryStructure: true,
  };

  it("is empty for a fully set-up employee", () => {
    expect(setupGaps(complete)).toEqual([]);
  });

  it("lists exactly what is missing, in a stable order", () => {
    expect(setupGaps({ ...complete, laborCategory: null, hasShift: false, hasBankAccount: false })).toEqual(["classification", "shift", "bank_account"]);
    expect(setupGaps({ ...complete, hasPayrollProfile: false, hasSalaryStructure: false })).toEqual(["payroll_profile", "salary_structure"]);
  });
});
