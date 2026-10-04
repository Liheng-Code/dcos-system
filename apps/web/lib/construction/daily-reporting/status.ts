// Module 10-01 Daily Reporting — derived UI label (design §14.5) and the
// string layer. A report carries independent state fields; the UI shows one
// label derived from them. All user-facing labels live here so a second
// language can be added without touching the components (open item O6).

import type { DelayCause, DelayType, DrReport, SectionKey, WorkStatus } from "./types";

export type DerivedLabel =
  | "Draft"
  | "Saved on device"
  | "Withdrawn"
  | "Awaiting PM"
  | "In review"
  | "Information requested"
  | "Returned — action required"
  | "Approved"
  | "Amendment pending"
  | "Official";

export function derivedLabel(
  report: Pick<DrReport, "submission_state" | "review_state">,
  inOfficialSummary = false,
): DerivedLabel {
  if (report.submission_state === "DRAFT") return "Draft";
  if (report.submission_state === "QUEUED_OFFLINE") return "Saved on device";
  if (report.submission_state === "WITHDRAWN") return "Withdrawn";
  switch (report.review_state) {
    case "RETURNED":
      return "Returned — action required";
    case "INFO_REQUESTED":
      return "Information requested";
    case "AMENDMENT_PENDING":
      return "Amendment pending";
    case "APPROVED":
    case "APPROVED_WITH_REMARK":
      return inOfficialSummary ? "Official" : "Approved";
    case "IN_REVIEW":
      return "In review";
    default:
      return "Awaiting PM";
  }
}

export type LabelTone = "neutral" | "info" | "warn" | "good" | "bad";

export function labelTone(label: DerivedLabel): LabelTone {
  switch (label) {
    case "Approved":
    case "Official":
      return "good";
    case "Returned — action required":
    case "Information requested":
      return "bad";
    case "Awaiting PM":
    case "In review":
    case "Amendment pending":
      return "info";
    case "Saved on device":
      return "warn";
    default:
      return "neutral";
  }
}

export const TONE_CLASS: Record<LabelTone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  warn: "border-amber-200 bg-amber-50 text-amber-700",
  good: "border-emerald-200 bg-emerald-50 text-emerald-700",
  bad: "border-red-200 bg-red-50 text-red-700",
};

export const SECTION_LABELS: Record<SectionKey, string> = {
  weather: "Weather & site conditions",
  manpower: "Manpower",
  activities: "Activities & progress",
  equipment: "Equipment",
  materials: "Materials",
  delays: "Delay events",
  issues: "Issues & constraints",
  instructions: "Instructions received",
  inspections: "Inspection requests",
  safety: "Safety",
  area_access: "Area / work-front access",
  next_day: "Next-day plan",
  evidence: "Evidence",
};

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  hindered: "Hindered",
  stopped: "Stopped",
};

export const DELAY_CAUSE_LABELS: Record<DelayCause, string> = {
  EMPLOYER_CAUSED: "Employer caused",
  CONTRACTOR_CAUSED: "Contractor caused",
  SUBCONTRACTOR_CAUSED: "Subcontractor caused",
  DESIGN_INFORMATION: "Design information",
  WEATHER: "Weather",
  THIRD_PARTY_UTILITY: "Third-party utility",
  AUTHORITY: "Authority",
  FORCE_MAJEURE: "Force majeure",
  MATERIAL_SUPPLY: "Material supply",
  ACCESS_NOT_RELEASED: "Access not released",
  OTHER: "Other",
};

export const DELAY_TYPE_LABELS: Record<DelayType, string> = {
  excusable: "Excusable",
  non_excusable: "Non-excusable",
  compensable: "Compensable",
  non_compensable: "Non-compensable",
};

/** Why a report written offline was stored for review instead of in the normal way. */
export const REVIEW_FLAG_LABELS: Record<string, string> = {
  offline_grant_revoked: "Offline access for this device was revoked before the report arrived",
  membership_revoked: "The sender is no longer a reporter of this unit",
  unit_not_active: "The unit is not active",
  rule_errors: "The report has errors that would have blocked it online",
  outside_wbs_scope: "An activity is outside the unit's WBS scope",
  future_date: "The report date is in the future",
  device_clock_ahead: "The device clock was ahead of the server",
};

export const SYNC_STATE_LABELS: Record<string, string> = {
  EVIDENCE_PENDING: "Photos still uploading from the device",
  REQUIRES_REVIEW: "Written offline — needs your attention",
  CONFLICT: "Sync conflict open",
};

/** "3 of 5 reports approved — 2 pending" (design §13.8 transparency rule). */
export function coverageBanner(c: { expected: number; approved: number; pending: number; missing: number }): string {
  const parts: string[] = [];
  if (c.pending > 0) parts.push(`${c.pending} pending`);
  if (c.missing > 0) parts.push(`${c.missing} missing`);
  const head = `${c.approved} of ${c.expected} reports approved`;
  return parts.length ? `${head} — ${parts.join(", ")}` : head;
}
