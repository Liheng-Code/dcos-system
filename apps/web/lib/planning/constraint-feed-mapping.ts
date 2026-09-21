// Constraint feed status-mapping (3.3 / 3.4).
//
// Pure (no I/O, no React). The single source of truth for how live Design /
// Procurement / QA-QC events translate into task_constraints statuses. The
// database triggers (20260919000019 / 20260919000020) implement the SAME
// tables; the readiness board calls these pure functions so the UI and the
// DB can never disagree. Kept here deliberately separate from any Supabase
// client so it is unit-testable without a network.

export type ConstraintKind =
  | "drawings"
  | "materials"
  | "crew"
  | "permits"
  | "equipment"
  | "predecessor";

export const CONSTRAINT_KINDS: ConstraintKind[] = [
  "drawings",
  "materials",
  "crew",
  "permits",
  "equipment",
  "predecessor",
];

export type ConstraintStatus = "ok" | "missing" | "unknown" | "pending";

export const CONSTRAINT_STATUSES: ConstraintStatus[] = ["ok", "missing", "unknown", "pending"];

/** The feed owner — mirrors task_constraints.source values written by the triggers. */
export type ConstraintSource = "manual" | "pr" | "pos" | "document" | "rfi" | "inspection";

/**
 * documents.status → drawings constraint.
 * superseded / archived leave the row as it stands (returns null = no write).
 * Mirrors sync_document_to_constraint().
 */
export function documentStatusToConstraint(
  status: string,
): { status: ConstraintStatus } | null {
  switch (status) {
    case "approved":
    case "ifc":
      return { status: "ok" };
    case "submitted":
    case "under_review":
    case "approved_with_comment":
      return { status: "pending" };
    case "draft":
    case "rejected":
      return { status: "missing" };
    default:
      return null; // superseded, archived — leave untouched
  }
}

/**
 * procurement_prs.approval_status → materials constraint.
 * Mirrors sync_pr_to_constraint().
 */
export function prApprovalStatusToConstraint(
  approvalStatus: string,
): { status: ConstraintStatus; notes: string } | null {
  switch (approvalStatus) {
    case "approved":
      return { status: "pending", notes: "PR approved" };
    case "rejected":
    case "cancelled":
    case "closed":
      return { status: "missing", notes: `PR ${approvalStatus}` };
    case "returned":
      return { status: "missing", notes: "PR returned for correction" };
    default:
      return null; // draft / submitted / under_budget_review — not decisive yet
  }
}

/**
 * procurement_pos.status → materials constraint.
 * Mirrors sync_po_to_constraint().
 */
export function poStatusToConstraint(status: string): { status: ConstraintStatus; notes: string } | null {
  switch (status) {
    case "delivered":
      return { status: "ok", notes: "PO delivered" };
    case "approved":
    case "issued":
    case "partially_delivered":
      return { status: "pending", notes: `PO ${status}` };
    case "on_hold":
    case "cancelled":
      return { status: "missing", notes: `PO ${status}` };
    default:
      return null; // draft / submitted / closed
  }
}

/** design_rfi.status → permits constraint. Mirrors sync_rfi_to_constraint(). */
export function rfiStatusToConstraint(
  status: string,
): { opening: boolean; closing: boolean; live: ConstraintStatus } | null {
  switch (status) {
    case "open":
      return { opening: true, closing: false, live: "missing" };
    case "responded":
    case "accepted":
    case "closed":
      return { opening: false, closing: true, live: "unknown" };
    default:
      return null;
  }
}

/** itp_items.inspection_type gate for the inspection feed. */
export function isHoldPoint(inspectionType: string): boolean {
  return inspectionType === "hold";
}

/**
 * inspection_results.result (only meaningful for hold points) → permits
 * constraint. Mirrors sync_inspection_holds_to_constraint()'s per-result branch.
 */
export function inspectionResultToConstraint(
  result: string | null,
): { constrains: boolean; status: ConstraintStatus } | null {
  if (result === "fail" || result === "pending") return { constrains: true, status: "missing" };
  if (result === "pass" || result === "na") return { constrains: false, status: "unknown" };
  return null;
}

export const CONSTRAINT_KIND_LABELS: Record<ConstraintKind, string> = {
  drawings: "Drawings",
  materials: "Materials",
  crew: "Crew",
  permits: "Permits",
  equipment: "Equipment",
  predecessor: "Predecessor",
};

export const CONSTRAINT_STATUS_LABELS: Record<ConstraintStatus, string> = {
  ok: "Ready",
  missing: "Missing",
  unknown: "Unknown",
  pending: "Pending",
};

export const CONSTRAINT_SOURCE_LABELS: Record<ConstraintSource, string> = {
  manual: "Manual",
  pr: "Procurement request",
  pos: "Purchase order",
  document: "Document",
  rfi: "RFI",
  inspection: "Inspection",
};