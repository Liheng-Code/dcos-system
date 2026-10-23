// Pure procurement document transition rules (PR, PO, invoice match, RFQ).
//
// No database or React imports. This mirrors the SQL functions procurement_transition_pr,
// procurement_confirm_budget, procurement_transition_po, procurement_transition_invoice_match and
// procurement_transition_rfq (migration 20261022134300_procurement_p1_transitions.sql). The
// database is the authority and re-checks every edge, permission, reason and segregation of
// duties; this file only decides which buttons to show and validates input early.
// Keep the two in step: same edges, same permission field, same reason rules.

export type ProcDocKind = "pr" | "po" | "invoice_match" | "rfq";

export type ProcResource = "pr" | "po" | "invoice" | "rfq";
export type ProcField = "submit" | "approve" | "reject" | "edit";
export type ProcVariant = "primary" | "approve" | "reject" | "warning" | "neutral";

export interface ProcTransition {
  from: string[];
  to: string;
  resource: ProcResource;
  field: ProcField;
  reasonRequired: boolean;
  /** Minimum trimmed reason length; defaults to 1 when a reason is required. */
  minReasonLength?: number;
  /** Segregation of duties: the actor may be neither the author nor the submitter. */
  sod: boolean;
  label: string;
  variant: ProcVariant;
  /** Edge that is not available through the transition function; use this RPC instead. */
  viaRpc?: "confirm_budget";
}

// ── Purchase requisitions (approval_status) ───────────────────────────────────

export const PR_TRANSITIONS: ProcTransition[] = [
  { from: ["draft", "returned"], to: "submitted", resource: "pr", field: "submit", reasonRequired: false, sod: false, label: "Submit for approval", variant: "primary" },
  { from: ["submitted"], to: "under_budget_review", resource: "pr", field: "approve", reasonRequired: false, sod: false, label: "Send to budget review", variant: "primary" },
  // Override approve: skips the budget confirmation, so it needs a real justification.
  { from: ["submitted"], to: "approved", resource: "pr", field: "approve", reasonRequired: true, minReasonLength: 20, sod: true, label: "Override approve", variant: "warning" },
  { from: ["under_budget_review"], to: "approved", resource: "pr", field: "approve", reasonRequired: false, sod: true, label: "Confirm budget and approve", variant: "approve", viaRpc: "confirm_budget" },
  { from: ["submitted", "under_budget_review"], to: "returned", resource: "pr", field: "reject", reasonRequired: true, sod: false, label: "Return for changes", variant: "warning" },
  { from: ["submitted", "under_budget_review"], to: "rejected", resource: "pr", field: "reject", reasonRequired: true, sod: false, label: "Reject", variant: "reject" },
  { from: ["draft", "returned", "submitted", "under_budget_review"], to: "cancelled", resource: "pr", field: "edit", reasonRequired: true, sod: false, label: "Cancel", variant: "neutral" },
  { from: ["approved"], to: "closed", resource: "pr", field: "edit", reasonRequired: false, sod: false, label: "Close", variant: "neutral" },
];

// ── Purchase orders (status). Delivery statuses come only from procurement_sync_po_delivery. ──

export const PO_TRANSITIONS: ProcTransition[] = [
  { from: ["draft"], to: "submitted", resource: "po", field: "submit", reasonRequired: false, sod: false, label: "Submit for approval", variant: "primary" },
  { from: ["submitted"], to: "approved", resource: "po", field: "approve", reasonRequired: false, sod: true, label: "Approve", variant: "approve" },
  { from: ["approved"], to: "issued", resource: "po", field: "submit", reasonRequired: false, sod: false, label: "Issue to supplier", variant: "primary" },
  { from: ["submitted"], to: "draft", resource: "po", field: "reject", reasonRequired: true, sod: false, label: "Return", variant: "warning" },
  { from: ["draft", "submitted", "approved"], to: "cancelled", resource: "po", field: "edit", reasonRequired: true, sod: false, label: "Cancel", variant: "neutral" },
  { from: ["delivered", "under_invoice_match"], to: "closed", resource: "po", field: "edit", reasonRequired: false, sod: false, label: "Close", variant: "neutral" },
];

// ── Invoice matches (status) ──────────────────────────────────────────────────
// Approving a match with a non-zero variance needs a variance reason when none is stored; that
// depends on row data, so the caller passes it as the reason (reasonRequired stays false here).

export const INVOICE_MATCH_TRANSITIONS: ProcTransition[] = [
  { from: ["pending", "matched", "variance_detected"], to: "approved", resource: "invoice", field: "approve", reasonRequired: false, sod: true, label: "Approve", variant: "approve" },
  { from: ["pending", "matched", "variance_detected"], to: "rejected", resource: "invoice", field: "reject", reasonRequired: true, sod: false, label: "Reject", variant: "reject" },
];

// ── RFQs (status). Award goes through procurement_award_rfq, not through here. ──

export const RFQ_TRANSITIONS: ProcTransition[] = [
  { from: ["draft"], to: "issued", resource: "rfq", field: "submit", reasonRequired: false, sod: false, label: "Issue RFQ", variant: "primary" },
  { from: ["issued"], to: "quotations_received", resource: "rfq", field: "edit", reasonRequired: false, sod: false, label: "Mark quotations received", variant: "primary" },
  { from: ["quotations_received"], to: "under_evaluation", resource: "rfq", field: "edit", reasonRequired: false, sod: false, label: "Start evaluation", variant: "primary" },
  { from: ["draft", "issued", "quotations_received", "under_evaluation"], to: "cancelled", resource: "rfq", field: "edit", reasonRequired: true, sod: false, label: "Cancel", variant: "neutral" },
  { from: ["issued", "quotations_received", "under_evaluation"], to: "rejected_all", resource: "rfq", field: "reject", reasonRequired: true, sod: false, label: "Reject all quotations", variant: "reject" },
];

const TRANSITIONS: Record<ProcDocKind, ProcTransition[]> = {
  pr: PR_TRANSITIONS,
  po: PO_TRANSITIONS,
  invoice_match: INVOICE_MATCH_TRANSITIONS,
  rfq: RFQ_TRANSITIONS,
};

const TERMINAL: Record<ProcDocKind, readonly string[]> = {
  pr: ["rejected", "cancelled", "closed"],
  po: ["cancelled", "closed"],
  invoice_match: ["approved", "rejected"],
  rfq: ["awarded", "rejected_all", "cancelled"],
};

export interface TransitionContext {
  can: (resource: ProcResource, field: ProcField) => boolean;
  userId: string | null;
  createdBy?: string | null;
  submittedBy?: string | null;
}

/**
 * Transitions the current user may start from `fromStatus`: the edge exists, the user holds the
 * permission, and for segregation-of-duties edges the user is neither the author nor the submitter.
 * A null author/submitter cannot be compared and is skipped, as in the database.
 */
export function availableTransitions(
  kind: ProcDocKind,
  fromStatus: string | null | undefined,
  ctx: TransitionContext,
): ProcTransition[] {
  if (!fromStatus) return [];
  return TRANSITIONS[kind].filter((t) => {
    if (!t.from.includes(fromStatus)) return false;
    if (!ctx.can(t.resource, t.field)) return false;
    if (t.sod && ctx.userId) {
      if (ctx.createdBy && ctx.userId === ctx.createdBy) return false;
      if (ctx.submittedBy && ctx.userId === ctx.submittedBy) return false;
    }
    return true;
  });
}

export function isTerminal(kind: ProcDocKind, status: string | null | undefined): boolean {
  return !!status && TERMINAL[kind].includes(status);
}

/** Returns an error message when the reason is missing or too short for the transition, else null. */
export function validateReason(t: ProcTransition, reason: string | null | undefined): string | null {
  if (!t.reasonRequired) return null;
  const v = (reason ?? "").trim();
  if (v.length === 0) return "A reason is required for this action.";
  const min = t.minReasonLength ?? 1;
  if (v.length < min) return `The reason must be at least ${min} characters.`;
  return null;
}

const PROC_PREFIX = /^\s*PROC_([A-Z_]+):\s*([\s\S]*)$/;

const capitalise = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Maps a PROC_* database error to friendly English; anything else falls back to the raw message. */
export function procErrorMessage(err: { message?: string } | null | undefined): string {
  const raw = err?.message?.trim();
  if (!raw) return "Something went wrong. Please try again.";
  const m = PROC_PREFIX.exec(raw);
  if (!m) {
    if (/row-level security|violates row-level security policy/i.test(raw)) return "You don't have permission to do that.";
    return raw;
  }
  const [, code, detail] = m;
  switch (code) {
    case "NOT_AUTHENTICATED":
      return "Your session has expired. Sign in again to continue.";
    case "NOT_FOUND":
      return "This record no longer exists or you cannot access it.";
    case "INVALID_TRANSITION":
      return "This action isn't available for the document's current status. Refresh and try again.";
    case "FORBIDDEN":
      return "You don't have permission to do this.";
    case "SOD_VIOLATION":
      return "You can't approve a document you created or submitted.";
    case "REASON_REQUIRED":
      return /variance/i.test(detail)
        ? "Enter a variance explanation before approving."
        : "A reason is required for this action.";
    case "REASON_TOO_SHORT": {
      const n = /(\d+)/.exec(detail)?.[1];
      return n ? `The reason must be at least ${n} characters.` : "The reason is too short.";
    }
    case "VALIDATION":
      return capitalise(detail.trim()) || "The submitted data is not valid.";
    case "TRANSITION_RPC_ONLY":
      return "Status can only be changed with the workflow actions, not by editing the record.";
    case "BAND_EXCEEDED":
    case "BIDS_SEALED":
      return capitalise(detail.trim());
    case "LOCKED":
      return "This document can no longer be edited because it has been submitted.";
    default:
      return capitalise(detail.trim()) || raw;
  }
}
