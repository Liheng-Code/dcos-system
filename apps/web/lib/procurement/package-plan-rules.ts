// Pure rules for the Procurement Package Plan (proc_project_package_plan): urgency of an order-by date and labels.

export type PackageCoverage = "no_pr" | "pr_late" | "covered";
export type PackageUrgency = "overdue" | "due_soon" | "planned" | "covered";

/** Days before the order-by date at which an uncovered package counts as "due soon". */
export const DUE_SOON_DAYS = 14;

export const COVERAGE_LABEL: Record<PackageCoverage, string> = { no_pr: "No PR", pr_late: "PR too late", covered: "Covered" };
export const URGENCY_LABEL: Record<PackageUrgency, string> = { overdue: "Order overdue", due_soon: "Order soon", planned: "Planned", covered: "Covered" };

/** Whole days from `today` to `date` (both yyyy-mm-dd); negative when the date has passed. */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/**
 * A covered package is done. Otherwise (no PR, or a PR whose required date is after the on-site date) the order-by
 * date decides: passed = overdue, within DUE_SOON_DAYS = due soon, else planned.
 */
export function packageUrgency(row: { coverage: PackageCoverage; order_by: string }, today: string): PackageUrgency {
  if (row.coverage === "covered") return "covered";
  const d = daysUntil(row.order_by, today);
  if (d < 0) return "overdue";
  if (d <= DUE_SOON_DAYS) return "due_soon";
  return "planned";
}

/** Counts for the summary chips. */
export function urgencyCounts(rows: { coverage: PackageCoverage; order_by: string; is_long_lead: boolean }[], today: string) {
  const out = { overdue: 0, due_soon: 0, planned: 0, covered: 0, long_lead: 0 };
  for (const r of rows) {
    out[packageUrgency(r, today)]++;
    if (r.is_long_lead) out.long_lead++;
  }
  return out;
}
