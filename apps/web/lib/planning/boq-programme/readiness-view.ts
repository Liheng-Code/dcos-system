// Pure helpers for the "Generate from BOQ" readiness page (doc 24 phase 1).

import type { BlockingLine, ReadinessReason, StageKey } from "./readiness";
import type { ReadinessSource } from "./readiness-service";

export const STAGE_ORDER: { key: StageKey; label: string }[] = [
  { key: "mapped", label: "Mapped to BOQ item" },
  { key: "linked", label: "Linked to activity" },
  { key: "labour", label: "Labour hours" },
  { key: "located", label: "Located" },
];

export const REASON_LABEL: Record<ReadinessReason, string> = {
  not_mapped: "Not mapped",
  not_linked: "Not linked",
  no_labour: "No labour",
  labour_placeholder: "Placeholder labour",
  labour_not_time: "Labour not in hours",
  location_unmapped: "Location unmapped",
  location_ignored: "Location ignored",
};

export const REASONS: ReadinessReason[] = Object.keys(REASON_LABEL) as ReadinessReason[];

/** A project that is still a draft is in tender; anything else has a contract BOQ. */
export function defaultReadinessSource(projectStatus: string | null | undefined): ReadinessSource {
  return !projectStatus || projectStatus === "draft" ? "tender" : "contract";
}

export type FixKind = "mapping" | "boq_item" | "location";

/** Where the one-click fix for a reason lives. */
export function fixKind(reason: ReadinessReason): FixKind {
  if (reason === "not_mapped") return "mapping";
  if (reason === "location_unmapped" || reason === "location_ignored") return "location";
  return "boq_item";
}

export type BlockingSort = "amount_desc" | "amount_asc" | "code";

/** Filters by reason (any of the line reasons) and sorts; returns a new array. */
export function filterSortBlocking(lines: readonly BlockingLine[], reason: ReadinessReason | "all", sort: BlockingSort): BlockingLine[] {
  const out = lines.filter((l) => reason === "all" || l.reasons.includes(reason));
  const cmp: Record<BlockingSort, (a: BlockingLine, b: BlockingLine) => number> = {
    amount_desc: (a, b) => b.amount - a.amount || a.itemCode.localeCompare(b.itemCode),
    amount_asc: (a, b) => a.amount - b.amount || a.itemCode.localeCompare(b.itemCode),
    code: (a, b) => a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true }),
  };
  return out.sort(cmp[sort]);
}

/** How many blocking lines carry each reason. */
export function reasonCounts(lines: readonly BlockingLine[]): Record<ReadinessReason, number> {
  const c = Object.fromEntries(REASONS.map((r) => [r, 0])) as Record<ReadinessReason, number>;
  for (const l of lines) for (const r of l.reasons) c[r]++;
  return c;
}
