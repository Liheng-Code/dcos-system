// Doc 35 I8: the WBS and its activities as an Excel workbook (sheet rows here; the button writes the file).
// WBS sheet: every node in tree order with its responsible person and the dates, activity count and duration-weighted
// progress of everything under it. Activities sheet: one row per activity with its WBS code and predecessors.

export interface ExportNode {
  id: string; parent_id: string | null; wbs_code: string | null; wbs_outline_code: string | null; wbs_name: string;
  node_type: string | null; sort_order: number | null; cost_code: string | null; discipline: string | null;
  responsible_id: string | null; is_locked: boolean | null;
}
export interface ExportTask {
  id: string; wbs_node_id: string | null; task_code: string | null; task_name: string; wbs_outline_code: string | null;
  start_date: string | null; end_date: string | null; duration_days: number | null; duration_unit: string | null;
  progress: number | null; is_milestone: boolean | null; constraint_type: string | null; constraint_date: string | null;
  baseline_start_date: string | null; baseline_finish_date: string | null; actual_start_date: string | null; actual_finish_date: string | null;
  dependency_task_ids: string[] | null; dependency_types: string[] | null; dependency_lag_days: number[] | null;
  owner_name: string | null; cost_code: string | null; sort_order: number | null;
}

type Cell = string | number | null;

export const WBS_HEADER = ["WBS code", "Name", "Level", "Type", "Responsible", "Cost code", "Discipline", "Start", "Finish", "Activities", "Progress %", "Locked"];
export const ACTIVITY_HEADER = [
  "WBS code", "WBS name", "Activity code", "Activity", "Duration", "Unit", "Start", "Finish", "Baseline start", "Baseline finish",
  "Actual start", "Actual finish", "Progress %", "Milestone", "Predecessors", "Constraint", "Constraint date", "Owner", "Cost code",
];

/** Predecessors as "CODE FS+2" (lag in days), the way the Sheet shows them. */
export function predecessorText(t: ExportTask, codeById: Map<string, string>): string {
  return (t.dependency_task_ids ?? []).map((id, i) => {
    const type = (t.dependency_types?.[i] ?? "FS").toUpperCase();
    const lag = Number(t.dependency_lag_days?.[i] ?? 0);
    return `${codeById.get(id) ?? id.slice(0, 8)} ${type}${lag ? (lag > 0 ? `+${lag}` : lag) : ""}`;
  }).join(", ");
}

export function wbsWorkbookRows(nodes: ExportNode[], tasks: ExportTask[], names: Map<string, string>): { wbs: Cell[][]; activities: Cell[][] } {
  const children = new Map<string | null, ExportNode[]>();
  for (const n of nodes) children.set(n.parent_id, [...(children.get(n.parent_id) ?? []), n]);
  for (const list of children.values()) list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.wbs_code ?? "").localeCompare(b.wbs_code ?? ""));
  const tasksBy = new Map<string, ExportTask[]>();
  for (const t of tasks) if (t.wbs_node_id) tasksBy.set(t.wbs_node_id, [...(tasksBy.get(t.wbs_node_id) ?? []), t]);
  const codeById = new Map(tasks.map((t) => [t.id, t.task_code ?? t.wbs_outline_code ?? t.id.slice(0, 8)]));

  const wbs: Cell[][] = [WBS_HEADER];
  const activities: Cell[][] = [ACTIVITY_HEADER];
  // roll-up under a node: earliest start, latest finish, count, duration-weighted progress
  const rollup = (id: string): { start: string | null; finish: string | null; count: number; w: number; p: number } => {
    let start: string | null = null; let finish: string | null = null; let count = 0; let w = 0; let p = 0;
    for (const t of tasksBy.get(id) ?? []) {
      if (t.start_date && (!start || t.start_date < start)) start = t.start_date;
      if (t.end_date && (!finish || t.end_date > finish)) finish = t.end_date;
      const d = Math.max(1, Number(t.duration_days) || 1);
      count++; w += d; p += d * (Number(t.progress) || 0);
    }
    for (const c of children.get(id) ?? []) {
      const r = rollup(c.id);
      if (r.start && (!start || r.start < start)) start = r.start;
      if (r.finish && (!finish || r.finish > finish)) finish = r.finish;
      count += r.count; w += r.w; p += r.p;
    }
    return { start, finish, count, w, p };
  };
  const walk = (parent: string | null, level: number) => {
    for (const n of children.get(parent) ?? []) {
      const r = rollup(n.id);
      const code = n.wbs_outline_code ?? n.wbs_code;
      wbs.push([code, n.wbs_name, level, n.node_type, n.responsible_id ? names.get(n.responsible_id) ?? "" : "", n.cost_code, n.discipline,
        r.start, r.finish, r.count, r.w ? Math.round((r.p / r.w) * 10) / 10 : 0, n.is_locked ? "yes" : ""]);
      const own = [...(tasksBy.get(n.id) ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.start_date ?? "").localeCompare(b.start_date ?? ""));
      for (const t of own) {
        activities.push([code, n.wbs_name, t.task_code ?? t.wbs_outline_code, t.task_name, t.duration_days, t.duration_unit ?? "wd",
          t.start_date, t.end_date, t.baseline_start_date, t.baseline_finish_date, t.actual_start_date, t.actual_finish_date,
          Number(t.progress) || 0, t.is_milestone ? "yes" : "", predecessorText(t, codeById), t.constraint_type, t.constraint_date,
          t.owner_name, t.cost_code]);
      }
      walk(n.id, level + 1);
    }
  };
  walk(null, 1);
  return { wbs, activities };
}
