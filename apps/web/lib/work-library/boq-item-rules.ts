// Pure helpers for the BOQ item detail dialog (Construction Work Library).

/** Name shown in BOQ lists: the work item name, falling back to the description. */
export function workItemLabel(w: { name?: string | null; description?: string | null }): string {
  return (w.name ?? "").trim() || (w.description ?? "").trim();
}

/** Distinct, trimmed units (case-insensitive) sorted alphabetically; the current unit is always included. */
export function mergeUnits(units: readonly (string | null | undefined)[], current?: string | null): string[] {
  const seen = new Map<string, string>();
  for (const u of [...units, current]) {
    const t = (u ?? "").trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Column heading of a manpower / equipment resource: "M Tiles Mason (hr/unit)", hour units shown as hr. */
export function resourceColumnLabel(c: { kind: "M" | "E"; name: string; unit: string }): string {
  const unit = /^(hr|hrs|hour|hours)$/i.test(c.unit.trim()) ? "hr" : c.unit;
  return `${c.kind} ${c.name} (${unit}/unit)`;
}

export interface WorkItemUsage {
  assemblyItems: number;
  tenderBoqItems: number;
  tenderAlternates: number;
  qsBoqItems: number;
  /** plan_act_master_work_items links: removed with the item (cascade). */
  activityLinks: number;
}

/** Records that stop a hard delete (everything except the activity links, which cascade). */
export function usageBlockers(u: WorkItemUsage): string[] {
  const parts: [number, string][] = [
    [u.assemblyItems, "assembly item"], [u.tenderBoqItems, "tender BOQ item"], [u.tenderAlternates, "tender BOQ alternate"], [u.qsBoqItems, "QS BOQ item"],
  ];
  return parts.filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}${n === 1 ? "" : "s"}`);
}

/** A consumption cell value: positive number to save, null to clear, "invalid" otherwise. */
export function parseConsumption(text: string): number | null | "invalid" {
  const t = text.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : "invalid";
}

/** "Division 09 - Finishes" for a work item / activity row, "-" without a division. */
export function divisionText(code: string | null | undefined, name: string | undefined): string {
  if (!code) return "-";
  return name ? `Division ${code} - ${name}` : `Division ${code}`;
}

/**
 * BOQ tab gap filters: compliance defects (no CSI division, no rate, no activity) that should reach zero. Items no
 * project uses yet are not a gap; the BOQ uses column shows them.
 */
export const WORK_ITEM_GAPS = ["division", "rate", "activity"] as const;
export type WorkItemGap = (typeof WORK_ITEM_GAPS)[number];
export const GAP_LABEL: Record<WorkItemGap, string> = { division: "No division", rate: "No rate", activity: "No activity" };
export const GAP_HINT: Record<WorkItemGap, string> = {
  division: "No CSI division: the item cannot be found by division in the libraries.",
  rate: "No net rate: the build-up is missing or a resource has no current price in QS.",
  activity: "Not linked to any current activity: Generate from BOQ cannot schedule it.",
};
/** Column test on wl_v_work_item_facts for each gap. */
export const GAP_FILTER: Record<WorkItemGap, { column: string; op: "is" | "zero" }> = {
  division: { column: "csi_division_code", op: "is" },
  rate: { column: "net_rate", op: "is" },
  activity: { column: "activity_links", op: "zero" },
};

/** The compliance gaps one item has, in display order. */
export function workItemGaps(w: { divisionCode?: string | null; rate?: number | null; usedBy: number; boqUses?: number }): WorkItemGap[] {
  const out: WorkItemGap[] = [];
  if (!w.divisionCode) out.push("division");
  if (w.rate === null || w.rate === undefined) out.push("rate");
  if (w.usedBy === 0) out.push("activity");
  return out;
}

/** "1 activity" / "2 activities" / "0 lines": a count with its noun in the right number. */
export function countLabel(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** "1,234.50" for a rate; "-" when there is none. */
export function rateText(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? "-" : rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
