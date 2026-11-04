// Pure rules for the Activity Library's CSI view: activities grouped by CSI division -> section (the same keys as the
// core Construction Work Library), and the status steps a bulk "Activate" walks through.

import type { LibraryStatus } from "./types";

/** Section bucket for activities of a division that have no CSI section. */
export const NO_SECTION = "__no_section__";
/** Division bucket for activities with no CSI division. */
export const NO_DIVISION_KEY = "__no_division__";

export type CsiSelection =
  | { level: "all" }
  | { level: "division"; code: string }
  | { level: "section"; division: string; code: string };

type CsiCoded = { csi_division_code?: string | null; csi_section_code?: string | null };

/** Activities per division and per "division|section" (NO_SECTION for none). */
export function csiCounts(rows: readonly CsiCoded[]): { byDivision: Map<string, number>; bySection: Map<string, number> } {
  const byDivision = new Map<string, number>();
  const bySection = new Map<string, number>();
  for (const r of rows) {
    const div = r.csi_division_code || NO_DIVISION_KEY;
    byDivision.set(div, (byDivision.get(div) ?? 0) + 1);
    const key = `${div}|${r.csi_section_code || NO_SECTION}`;
    bySection.set(key, (bySection.get(key) ?? 0) + 1);
  }
  return { byDivision, bySection };
}

/** True when an activity falls in the selected division / section. */
export function inCsiSelection(r: CsiCoded, sel: CsiSelection): boolean {
  if (sel.level === "all") return true;
  const div = r.csi_division_code || NO_DIVISION_KEY;
  if (sel.level === "division") return div === sel.code;
  return div === sel.division && (r.csi_section_code || NO_SECTION) === sel.code;
}

/** The statuses a master steps through to become active (the guard allows one step at a time); [] when it can't. */
export function activationSteps(status: LibraryStatus): LibraryStatus[] {
  if (status === "draft") return ["under_review", "approved", "active"];
  if (status === "under_review") return ["approved", "active"];
  if (status === "approved") return ["active"];
  return [];
}
