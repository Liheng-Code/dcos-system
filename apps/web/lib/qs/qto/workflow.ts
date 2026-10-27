// Version workflow (Master Plan §13). The database (qto_version_transition) is the authority;
// this mirror only decides which buttons the UI shows.

export const VERSION_STATUSES = [
  "DRAFT",
  "IN_PROGRESS",
  "SUBMITTED_FOR_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "PUBLISHED",
  "CANCELLED",
] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

export const VERSION_STATUS_LABEL: Record<VersionStatus, string> = {
  DRAFT: "Draft",
  IN_PROGRESS: "In progress",
  SUBMITTED_FOR_REVIEW: "Submitted for review",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  CANCELLED: "Cancelled",
};

export const VERSION_TRANSITIONS: Record<VersionStatus, VersionStatus[]> = {
  DRAFT: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["SUBMITTED_FOR_REVIEW", "CANCELLED"],
  SUBMITTED_FOR_REVIEW: ["APPROVED", "CHANGES_REQUESTED"],
  CHANGES_REQUESTED: ["IN_PROGRESS", "CANCELLED"],
  APPROVED: ["PUBLISHED"],
  PUBLISHED: [],
  CANCELLED: [],
};

export const EDITABLE_STATUSES: readonly VersionStatus[] = ["DRAFT", "IN_PROGRESS", "CHANGES_REQUESTED"];

export function canTransitionVersion(from: VersionStatus, to: VersionStatus): boolean {
  return VERSION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isEditable(status: VersionStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

/** A new version may start only when the current one is closed. */
export function canStartNewVersion(status: VersionStatus): boolean {
  return status === "APPROVED" || status === "PUBLISHED" || status === "CANCELLED";
}

export type TransitionNeed = { action: string; field: string; comment: "none" | "optional" | "required" };

/** Permission (module `qto`) and comment needed for each target status, as checked by the RPC. */
export const TRANSITION_NEEDS: Record<Exclude<VersionStatus, "DRAFT">, TransitionNeed> = {
  IN_PROGRESS: { action: "qto_sessions", field: "edit", comment: "none" },
  SUBMITTED_FOR_REVIEW: { action: "qto_sessions", field: "submit", comment: "optional" },
  APPROVED: { action: "qto_approval", field: "approve", comment: "optional" },
  CHANGES_REQUESTED: { action: "qto_approval", field: "approve", comment: "required" },
  PUBLISHED: { action: "qto_publish", field: "approve", comment: "none" },
  CANCELLED: { action: "qto_sessions", field: "delete", comment: "required" },
};

export const QUANTITY_STATUSES = ["FIRM", "PROVISIONAL", "EXCLUDED", "PENDING_CLARIFICATION"] as const;
export type QuantityStatus = (typeof QUANTITY_STATUSES)[number];

export const QUANTITY_STATUS_INFO: Record<QuantityStatus, { label: string; meaning: string }> = {
  FIRM: { label: "Firm", meaning: "Measured from complete information; transferred to the BOQ." },
  PROVISIONAL: {
    label: "Provisional",
    meaning: "Measured on incomplete information; needs a documented assumption. Transferred only when chosen.",
  },
  EXCLUDED: { label: "Excluded", meaning: "Not part of this scope; needs an exclusion reason. Never transferred." },
  PENDING_CLARIFICATION: {
    label: "Pending clarification",
    meaning: "Waiting on an RFI or clarification. Never transferred.",
  },
};
