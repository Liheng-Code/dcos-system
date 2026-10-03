// Pure helpers for the HR "Needs attention" inbox: what kind of attendance review a reason
// text is, and what an employee is still missing before payroll can run on auto-provisioned data.

export type ReviewKind =
  | "missing_checkout"
  | "ot_not_approved"
  | "ot_not_worked"
  | "leave_overlap"
  | "half_day"
  | "site_mismatch"
  | "invalid_logs"
  | "other";

export const REVIEW_KIND_LABEL: Record<ReviewKind, string> = {
  missing_checkout: "Missing check-out",
  ot_not_approved: "Worked beyond the schedule without approved OT",
  ot_not_worked: "Approved OT not fully worked",
  leave_overlap: "Attendance on an approved leave day",
  half_day: "Half-day leave without attendance",
  site_mismatch: "Checked in at an unassigned site",
  invalid_logs: "Only invalid attendance logs",
  other: "Other",
};

// The reason texts are produced by buildAttendanceDay (attendance-daily.ts); keep these in step.
const KIND_PATTERNS: [ReviewKind, RegExp][] = [
  ["missing_checkout", /Missing check-out/i],
  ["ot_not_approved", /without an approved OT/i],
  ["ot_not_worked", /Approved OT .* but only/i],
  ["leave_overlap", /approved leave day/i],
  ["half_day", /Half-day leave/i],
  ["site_mismatch", /not assigned to the employee/i],
  ["invalid_logs", /invalid attendance logs/i],
];

/** A day can carry several reasons joined by "; ": it is classified by each one. */
export function classifyReviewReason(reason: string | null): ReviewKind[] {
  if (!reason) return [];
  const kinds = new Set<ReviewKind>();
  for (const part of reason.split("; ")) {
    kinds.add(KIND_PATTERNS.find(([, re]) => re.test(part))?.[0] ?? "other");
  }
  return [...kinds];
}

export interface SetupState {
  employmentCategory: string | null;
  laborCategory: string | null;
  hasReportingManager: boolean;
  hasShift: boolean;
  hasPayrollProfile: boolean;
  hasTaxProfile: boolean;
  hasNssfProfile: boolean;
  hasBankAccount: boolean;
  hasSalaryStructure: boolean;
}

export type SetupGap =
  | "classification"
  | "reporting_manager"
  | "shift"
  | "payroll_profile"
  | "tax_profile"
  | "nssf_profile"
  | "bank_account"
  | "salary_structure";

export const SETUP_GAP_LABEL: Record<SetupGap, string> = {
  classification: "Employment / labor category",
  reporting_manager: "Reporting manager",
  shift: "Shift",
  payroll_profile: "Payroll profile",
  tax_profile: "Tax profile",
  nssf_profile: "NSSF profile",
  bank_account: "Bank account",
  salary_structure: "Salary structure",
};

export function setupGaps(state: SetupState): SetupGap[] {
  const gaps: SetupGap[] = [];
  if (!state.employmentCategory || !state.laborCategory) gaps.push("classification");
  if (!state.hasReportingManager) gaps.push("reporting_manager");
  if (!state.hasShift) gaps.push("shift");
  if (!state.hasPayrollProfile) gaps.push("payroll_profile");
  if (!state.hasTaxProfile) gaps.push("tax_profile");
  if (!state.hasNssfProfile) gaps.push("nssf_profile");
  if (!state.hasBankAccount) gaps.push("bank_account");
  if (!state.hasSalaryStructure) gaps.push("salary_structure");
  return gaps;
}
