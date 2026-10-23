// Pure helpers for the BOQ item detail dialog (Activity Database).

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
