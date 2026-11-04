// Sheet and Gantt views (doc 35 U3; PRD FR-059): filters and group-by over the WBS outline. Pure, no I/O.
// Filtering keeps a node while any task under it matches. Grouping replaces the WBS nodes with one read-only
// summary row per group (status, priority, discipline, owner or criticality), under the project row.

import type { TaskFloat } from "@dcos/scheduling-engine";
import { PROJECT_NODE_TYPE, type SheetNode, type SheetRow, type SheetTask } from "@/components/planning/sheet-types";

export interface ViewFilter {
  /** code or name contains */
  text?: string;
  statuses?: string[];
  incompleteOnly?: boolean;
  criticalOnly?: boolean;
  discipline?: string | null;
  owner?: string | null;
  /** activities that overlap this window (inclusive, ISO dates) */
  from?: string | null;
  to?: string | null;
}

export type GroupBy = "wbs" | "status" | "priority" | "discipline" | "owner" | "critical";

export const GROUP_BY_LABEL: Record<GroupBy, string> = {
  wbs: "WBS (no grouping)",
  status: "Status",
  priority: "Priority",
  discipline: "Discipline",
  owner: "Owner",
  critical: "Criticality",
};

/** Row id prefix of group summary rows; they are read-only and have no WBS node behind them. */
export const GROUP_ROW_PREFIX = "node:group:";

export const isFilterActive = (f: ViewFilter): boolean =>
  !!(f.text?.trim() || f.statuses?.length || f.incompleteOnly || f.criticalOnly || f.discipline || f.owner || f.from || f.to);

export function taskMatches(t: SheetTask, f: ViewFilter, float: ReadonlyMap<string, TaskFloat>): boolean {
  const q = f.text?.trim().toLowerCase();
  if (q && !t.task_code.toLowerCase().includes(q) && !t.task_name.toLowerCase().includes(q)) return false;
  if (f.statuses?.length && !f.statuses.includes(t.status)) return false;
  if (f.incompleteOnly && t.progress >= 100) return false;
  if (f.criticalOnly && !float.get(t.id)?.critical) return false;
  if (f.discipline && (t.discipline ?? "") !== f.discipline) return false;
  if (f.owner && (t.owner_name ?? "") !== f.owner) return false;
  if (f.from && t.end_date && t.end_date < f.from) return false;
  if (f.to && t.start_date && t.start_date > f.to) return false;
  return true;
}

/** Keeps matching tasks and the nodes above them (and always the project row). */
export function filterTree(rows: SheetRow[], f: ViewFilter, float: ReadonlyMap<string, TaskFloat>): SheetRow[] {
  if (!isFilterActive(f)) return rows;
  const walk = (list: SheetRow[]): SheetRow[] =>
    list.reduce<SheetRow[]>((acc, r) => {
      if (r.kind === "task") {
        if (taskMatches(r.task, f, float)) acc.push(r);
        return acc;
      }
      const children = walk(r.children);
      if (children.length > 0 || r.node.node_type === PROJECT_NODE_TYPE) acc.push({ ...r, children });
      return acc;
    }, []);
  return walk(rows);
}

const NONE = "(none)";

function groupKey(t: SheetTask, by: GroupBy, float: ReadonlyMap<string, TaskFloat>): string {
  switch (by) {
    case "status": return t.status || NONE;
    case "priority": return t.priority || NONE;
    case "discipline": return t.discipline || NONE;
    case "owner": return t.owner_name || "Unassigned";
    case "critical": {
      const fl = float.get(t.id);
      return fl?.critical ? "Critical" : fl?.nearCritical ? "Near-critical" : "Not critical";
    }
    default: return NONE;
  }
}

const CRITICAL_ORDER = ["Critical", "Near-critical", "Not critical"];

function summary(tasks: SheetTask[]): { start: string | null; end: string | null; taskCount: number; progress: number } {
  const starts = tasks.map((t) => t.start_date).filter(Boolean).sort() as string[];
  const ends = tasks.map((t) => t.end_date).filter(Boolean).sort() as string[];
  // progress weighted by duration (1 for milestones / missing durations)
  const w = tasks.map((t) => Math.max(1, Number(t.duration_days) || 0));
  const total = w.reduce((a, b) => a + b, 0);
  const progress = total ? Math.round(tasks.reduce((s, t, i) => s + (Number(t.progress) || 0) * w[i], 0) / total) : 0;
  return { start: starts[0] ?? null, end: ends[ends.length - 1] ?? null, taskCount: tasks.length, progress };
}

/** Replaces the WBS outline with one summary row per group; tasks keep their outline order inside a group. */
export function groupTree(rows: SheetRow[], by: GroupBy, float: ReadonlyMap<string, TaskFloat>): SheetRow[] {
  if (by === "wbs") return rows;
  const tasks: SheetRow[] = [];
  const walk = (list: SheetRow[]) => {
    for (const r of list) {
      if (r.kind === "task") tasks.push(r);
      else walk(r.children);
    }
  };
  walk(rows);

  const groups = new Map<string, SheetRow[]>();
  for (const r of tasks) {
    if (r.kind !== "task") continue;
    const k = groupKey(r.task, by, float);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const keys = [...groups.keys()].sort((a, b) =>
    by === "critical" ? CRITICAL_ORDER.indexOf(a) - CRITICAL_ORDER.indexOf(b)
      : a === NONE || a === "Unassigned" ? 1 : b === NONE || b === "Unassigned" ? -1 : a.localeCompare(b));

  const projectRow = rows.length === 1 && rows[0].kind === "node" && rows[0].node.node_type === PROJECT_NODE_TYPE ? rows[0] : null;
  const projectId = projectRow?.node.project_id ?? (tasks[0]?.kind === "task" ? tasks[0].task.project_id : "");
  const groupRows: SheetRow[] = keys.map((k, i) => {
    const members = groups.get(k)!;
    const node: SheetNode = {
      id: `group:${by}:${k}`, project_id: projectId, parent_id: null, node_type: "group",
      wbs_code: "", wbs_name: `${k} (${members.length})`, sort_order: i, progress_percent: 0,
    };
    const roll = summary(members.map((m) => (m as Extract<SheetRow, { kind: "task" }>).task));
    node.progress_percent = roll.progress;
    return { id: `${GROUP_ROW_PREFIX}${by}:${k}` as const, kind: "node" as const, node, rollup: roll, children: members };
  });
  return projectRow ? [{ ...projectRow, children: groupRows }] : groupRows;
}

/** Distinct values offered by the filter pickers. */
export function filterOptions(tasks: readonly SheetTask[]): { statuses: string[]; disciplines: string[]; owners: string[] } {
  const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
  return { statuses: uniq(tasks.map((t) => t.status)), disciplines: uniq(tasks.map((t) => t.discipline)), owners: uniq(tasks.map((t) => t.owner_name)) };
}
