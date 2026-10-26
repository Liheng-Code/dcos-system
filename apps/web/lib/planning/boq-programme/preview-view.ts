// Pure helpers for the programme preview (doc 24 phase 2 UI): names, grouping, filters, warning groups.

import type { Confidence, PlanAction, PlannedTask, PlanWarning, WarningCode } from "./boq-programme-planner";

/** Readable resource name: strips the "Migrated from ..., desc='X'" and "Migrated ... placeholder for X. Category ..." wrappers. */
export function cleanResourceName(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  const desc = /^Migrated from\b.*?desc\s*=\s*'([^']+)'/i.exec(s);
  if (desc) return desc[1].trim();
  const ph = /^Migrated\b.*?\bplaceholder for\s+(.+?)\.?\s+Category\b/i.exec(s);
  if (ph) return ph[1].trim();
  const cut = s.split(/\s+Category \(/)[0];
  return cut.length > 60 ? `${cut.slice(0, 57).trimEnd()}...` : cut;
}

export type RowKind = "create" | "update" | "unchanged" | "skipped";

/** What the action badge shows: an update with equal values is "unchanged"; started and locked are both "skipped". */
export function rowKind(t: Pick<PlannedTask, "action" | "unchanged">): RowKind {
  if (t.action === "create") return "create";
  if (t.action === "update") return t.unchanged ? "unchanged" : "update";
  return "skipped";
}

export const ROW_KIND_LABEL: Record<RowKind, string> = { create: "Create", update: "Update", unchanged: "Unchanged", skipped: "Skipped" };

export const SKIP_REASON: Record<Extract<PlanAction, "skip_started" | "skip_locked">, string> = {
  skip_started: "Already started",
  skip_locked: "Locked",
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "High", review: "Review", low: "Low" };

export const WARNING_LABEL: Record<WarningCode, string> = {
  line_unmapped: "BOQ line not mapped to a cost item",
  item_unlinked: "BOQ item not linked to an activity",
  no_labour: "No labour hours on the BOQ item",
  labour_not_time: "Labour not in hours, days, weeks or months",
  equipment_not_time: "Equipment not in hours, days, weeks or months",
  line_unlocated: "BOQ line has no location",
  no_crew: "Crew size not set (default used)",
  clamped: "Duration clamped to the project limits",
};

/** Division code of a task: the master CSI division, else the Dxx prefix of its visible code, else "". */
export function divisionOfTask(t: Pick<PlannedTask, "visibleCode" | "masterId">, masterDivision: ReadonlyMap<string, string | null>): string {
  const d = masterDivision.get(t.masterId);
  if (d) return d;
  const m = /^D(\d{2})-/i.exec(t.visibleCode ?? "");
  return m ? m[1] : "";
}

export interface DivisionGroup { code: string; tasks: PlannedTask[] }
export interface FloorGroup { nodeId: string; name: string; divisions: DivisionGroup[]; count: number }

/** Floors in `floorOrder` (unknown nodes last), then divisions by code, then tasks by visible code / name. */
export function groupPreview(
  tasks: readonly PlannedTask[], floorOrder: readonly string[], nodeName: ReadonlyMap<string, string>, masterDivision: ReadonlyMap<string, string | null>,
): FloorGroup[] {
  const rank = new Map(floorOrder.map((id, i) => [id, i]));
  const floors = new Map<string, Map<string, PlannedTask[]>>();
  for (const t of tasks) {
    const f = floors.get(t.nodeId) ?? new Map<string, PlannedTask[]>();
    const d = divisionOfTask(t, masterDivision);
    f.set(d, [...(f.get(d) ?? []), t]);
    floors.set(t.nodeId, f);
  }
  const byTask = (a: PlannedTask, b: PlannedTask) => (a.visibleCode ?? a.masterCode).localeCompare(b.visibleCode ?? b.masterCode) || a.name.localeCompare(b.name);
  return [...floors]
    .map(([nodeId, divs]) => {
      const divisions = [...divs].map(([code, ts]) => ({ code, tasks: [...ts].sort(byTask) })).sort((a, b) => a.code.localeCompare(b.code));
      return { nodeId, name: nodeName.get(nodeId) ?? "Unknown location", divisions, count: divisions.reduce((s, d) => s + d.tasks.length, 0) };
    })
    .sort((a, b) => (rank.get(a.nodeId) ?? 1e9) - (rank.get(b.nodeId) ?? 1e9) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export interface PreviewFilters { kind: RowKind | "all"; confidence: Confidence | "all"; warningsOnly: boolean; search: string }
export const NO_FILTERS: PreviewFilters = { kind: "all", confidence: "all", warningsOnly: false, search: "" };

export function filterTasks(tasks: readonly PlannedTask[], f: PreviewFilters): PlannedTask[] {
  const q = f.search.trim().toLowerCase();
  return tasks.filter((t) =>
    (f.kind === "all" || rowKind(t) === f.kind)
    && (f.confidence === "all" || t.confidence === f.confidence)
    && (!f.warningsOnly || t.warnings.length > 0)
    && (!q || t.name.toLowerCase().includes(q) || (t.visibleCode ?? "").toLowerCase().includes(q) || t.masterCode.toLowerCase().includes(q)));
}

export interface WarningGroup { code: WarningCode; count: number; items: PlanWarning[] }

/** Warnings grouped by code, biggest group first. */
export function groupWarnings(warnings: readonly PlanWarning[]): WarningGroup[] {
  const m = new Map<WarningCode, PlanWarning[]>();
  for (const w of warnings) m.set(w.code, [...(m.get(w.code) ?? []), w]);
  return [...m].map(([code, items]) => ({ code, count: items.length, items })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

/** True when the value the tasks drive equals the BOQ total (to the cent). */
export function valueMatches(driven: number, total: number): boolean {
  return Math.abs(driven - total) < 0.005;
}
