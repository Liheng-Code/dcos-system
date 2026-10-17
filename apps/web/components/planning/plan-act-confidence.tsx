"use client";

import { cn } from "@/lib/utils";
import type { Confidence, ExceptionReason } from "@/lib/planning/activity-library/confidence";

export const REASON_LABEL: Record<ExceptionReason, string> = {
  missing_quantity: "Missing quantity",
  unit_mismatch: "Unit mismatch",
  unknown_method: "No method",
  no_productivity: "No productivity",
  draft_productivity: "Draft productivity",
  missing_predecessor: "No predecessor",
  logic_conflict: "Logic conflict",
  no_applicable_template: "Template not applicable",
  project_constraint: "Project constraint",
  ai_suggestion: "AI suggestion",
  planner_override: "Planner override",
};

const STYLE: Record<Confidence, string> = {
  high: "bg-emerald-50 text-emerald-700",
  review: "bg-amber-50 text-amber-700",
  low: "bg-red-50 text-red-700",
};

export function ConfidencePill({ value }: { value: Confidence }) {
  return <span className={cn("inline-flex rounded px-2 py-0.5 text-[11px] font-bold uppercase", STYLE[value])}>{value}</span>;
}
