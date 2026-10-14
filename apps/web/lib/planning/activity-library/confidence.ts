// Confidence / exception model for generated activities. Deterministic: the planner reviews exceptions, not everything.

export type ExceptionReason =
  | "missing_quantity"
  | "unit_mismatch"
  | "unknown_method"
  | "no_productivity"
  | "draft_productivity"
  | "missing_predecessor"
  | "logic_conflict"
  | "no_applicable_template"
  | "project_constraint"
  | "ai_suggestion"
  | "planner_override";

export type Confidence = "high" | "review" | "low";

export interface ConfidenceInput {
  hasQuantity: boolean;
  unitMismatch?: boolean;
  hasMethod: boolean;
  hasProductivity: boolean;
  productivityApproved: boolean;
  predecessorsResolved: boolean;
  logicConflict?: boolean;
  templateApplicable: boolean;
  hasProjectConstraint?: boolean;
  fromAi?: boolean;
  overridden?: boolean;
}

/** Blocking reasons make an item "low"; softer ones "review"; none = "high". */
const BLOCKING: ExceptionReason[] = ["missing_quantity", "no_productivity", "logic_conflict", "no_applicable_template"];

export function assessConfidence(i: ConfidenceInput): { confidence: Confidence; reasons: ExceptionReason[] } {
  const reasons: ExceptionReason[] = [];
  if (!i.hasQuantity) reasons.push("missing_quantity");
  if (i.unitMismatch) reasons.push("unit_mismatch");
  if (!i.hasMethod) reasons.push("unknown_method");
  if (!i.hasProductivity) reasons.push("no_productivity");
  else if (!i.productivityApproved) reasons.push("draft_productivity");
  if (!i.predecessorsResolved) reasons.push("missing_predecessor");
  if (i.logicConflict) reasons.push("logic_conflict");
  if (!i.templateApplicable) reasons.push("no_applicable_template");
  if (i.hasProjectConstraint) reasons.push("project_constraint");
  if (i.fromAi) reasons.push("ai_suggestion");
  if (i.overridden) reasons.push("planner_override");

  const confidence: Confidence = reasons.length === 0 ? "high" : reasons.some((r) => BLOCKING.includes(r)) ? "low" : "review";
  return { confidence, reasons };
}
