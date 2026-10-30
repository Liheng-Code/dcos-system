// Pure rules for the Requirements Tracker: what a project's activities need (Activity Database catalogues) against
// the records that fulfil it (submittals in Document Control, ITP lines in QA/QC, Design MEP commissioning records and
// coordination log entries).
// Links: submittal_packages.shop_drawing_type_id / method_statement_id, itp_items.tc_item_id (20261030161500);
// design_mep_commissioning.tc_item_id, design_coordination_log.coordination_item_id (20261030164500).

export type RequirementKind = "shop_drawing" | "method_statement" | "tc" | "coordination";
export type RequirementState = "missing" | "resubmit" | "in_progress" | "done";

export const REQUIREMENT_KIND_LABEL: Record<RequirementKind, string> = {
  shop_drawing: "Shop Drawing",
  method_statement: "Method Statement",
  tc: "Testing & Commissioning",
  coordination: "Coordination",
};

export const REQUIREMENT_STATE_LABEL: Record<RequirementState, string> = {
  missing: "Missing",
  resubmit: "Resubmit",
  in_progress: "In progress",
  done: "Done",
};

/** A submittal's consultant status as a requirement state (same grouping as the Submittal register). */
export function submittalState(consultantStatus: string | null | undefined): RequirementState {
  if (consultantStatus === "code_a_approved" || consultantStatus === "code_b_approved_as_noted") return "done";
  if (consultantStatus === "code_c_revise_resubmit" || consultantStatus === "code_d_rejected") return "resubmit";
  return "in_progress";
}

/** An ITP line counts as done once its ITP is closed; while the ITP is draft or active it is in progress. */
export function itpState(itpStatus: string | null | undefined): RequirementState {
  return itpStatus === "closed" ? "done" : "in_progress";
}

/** A Design MEP commissioning record: passed or closed is done, failed needs a retest. */
export function commissioningState(status: string | null | undefined): RequirementState {
  if (status === "passed" || status === "closed") return "done";
  if (status === "failed") return "resubmit";
  return "in_progress";
}

/** A Design coordination log entry: resolved or closed is done; a cancelled entry does not count (null). */
export function coordinationLogState(status: string | null | undefined): RequirementState | null {
  if (status === "cancelled") return null;
  return status === "resolved" || status === "closed" ? "done" : "in_progress";
}

/** Overall state of a requirement from its records: any done wins, then any still in progress, then resubmit; none = missing. */
export function overallState(states: readonly RequirementState[]): RequirementState {
  if (states.includes("done")) return "done";
  if (states.includes("in_progress")) return "in_progress";
  if (states.includes("resubmit")) return "resubmit";
  return "missing";
}

/** Counts per state, for the tracker's summary. */
export function stateCounts(states: readonly RequirementState[]): Record<RequirementState, number> {
  const out: Record<RequirementState, number> = { missing: 0, resubmit: 0, in_progress: 0, done: 0 };
  for (const s of states) out[s] += 1;
  return out;
}

/** ITP inspection type for a T&C item: tests and commissioning are witnessed, inspections are hold points. */
export function itpInspectionType(tcType: string): "hold" | "witness" | "review" {
  return tcType === "inspection" ? "hold" : "witness";
}
