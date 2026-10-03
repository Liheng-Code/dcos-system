// Types + column definitions for the WBS Builder — an Excel / MS-Project-style
// editable grid over `wbs_nodes`. Every editable row is a wbs_nodes row; activities
// (wbs_tasks) can be shown as read-only `task:` rows when "Show activities" is on.

import type { HierNode } from "@/lib/wbs-hierarchy";
import { computeWbsCode, type WbsCodeMask } from "@/lib/planning/wbs-code-mask";

/** Explicit subset of public.wbs_nodes the grid reads/writes. */
export interface WbsBuilderNode extends HierNode {
  id: string;
  project_id: string;
  parent_id: string | null;
  node_type: string;
  wbs_code: string; // OWN code only — DB unique index is (project_id, parent_id, wbs_code)
  wbs_name: string;
  full_path: string | null;
  sort_order: number;
  status: string;
  progress_percent: number;
  discipline: string | null;
  area_label: string | null;
  cost_code: string | null;
  is_below_ground: boolean | null;
  is_external_works: boolean | null;
  is_locked: boolean;
  locked_at: string | null;
  locked_by: string | null;
  /** Saved WBS code override (Planning › WBS Code Definition › renumber / hand edit). */
  wbs_outline_code?: string | null;
}

export const NODE_COLS =
  "id, project_id, parent_id, node_type, wbs_code, wbs_name, full_path, sort_order, status, progress_percent, discipline, area_label, cost_code, is_below_ground, is_external_works, is_locked, locked_at, locked_by, wbs_outline_code";

/** An activity (wbs_tasks row) as shown read-only in the grid; edited in the node panel / task page. */
export interface WbsActivitySummary {
  id: string;
  wbs_node_id: string | null;
  task_code: string | null;
  wbs_outline_code?: string | null;
  task_name: string;
  status: string | null;
  progress: number | null;
  duration_days: number | null;
  discipline: string | null;
  sort_order: number | null;
}

/**
 * One row of the outline handed to react-arborist. Node rows are wbs_nodes; activity rows
 * (`task:` ids, only when "Show activities" is on) are read-only leaves under their package,
 * and carry the package's node so shared code can read it.
 */
export interface WbsBuilderRow {
  id: `node:${string}` | `task:${string}`;
  node: WbsBuilderNode;
  task?: WbsActivitySummary;
  children: WbsBuilderRow[];
}

export const isActivityRowId = (id: string) => id.startsWith("task:");

/** Editable, keyboard-navigable cell fields (drive `updateNodeField`). */
export type WbsBuilderField =
  | "wbs_code"
  | "node_type"
  | "wbs_name"
  | "discipline"
  | "area_label"
  | "cost_code"
  | "status";

/** Every column key, including the non-editable Progress / Activities / GFA / Action columns. */
export type WbsColumnKey = WbsBuilderField | "progress" | "activities" | "gfa" | "action";

/** Columns navigable left/right by keyboard, in visual order. */
export const NAV_COLUMNS: WbsBuilderField[] = [
  "wbs_code",
  "wbs_name",
  "node_type",
  "discipline",
  "area_label",
  "cost_code",
  "status",
];

/** Node types whose GFA is entered by hand; every other type rolls up. */
export const GFA_EDITABLE_TYPES = new Set(["level", "zone"]);

export interface WbsBuilderColumn {
  field: WbsColumnKey;
  label: string;
  width: number;
  variant: "text" | "select" | "number" | "action";
  mono?: boolean;
  align?: "right";
  options?: { value: string; label: string }[];
}

/** The 8 node types shown in the picker — verbatim from wbs-node-edit-sheet.tsx. */
export const NODE_TYPE_OPTIONS = [
  { value: "phase", label: "Phase" },
  { value: "building", label: "Building / Area" },
  { value: "level", label: "Level" },
  { value: "zone", label: "Zone" },
  { value: "room", label: "Room / Space" },
  { value: "element", label: "Element" },
  { value: "discipline", label: "Discipline" },
  { value: "task_group", label: "Task Group" },
];

/** Matches the wbs_nodes.status CHECK constraint. */
export const STATUS_OPTIONS = ["active", "on_hold", "closed"];

export function statusLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function nodeTypeLabel(value: string): string {
  if (value === "project") return "Project";
  return NODE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export const WBS_BUILDER_COLUMNS: WbsBuilderColumn[] = [
  { field: "wbs_code", label: "WBS Code", width: 130, variant: "text", mono: true },
  { field: "wbs_name", label: "Activity / Work Package", width: 340, variant: "text" },
  { field: "node_type", label: "Type", width: 150, variant: "select", options: NODE_TYPE_OPTIONS },
  { field: "discipline", label: "Discipline", width: 130, variant: "text" },
  { field: "area_label", label: "Floor / Area", width: 120, variant: "text" },
  { field: "cost_code", label: "Cost Code", width: 110, variant: "text", mono: true },
  {
    field: "status",
    label: "Status",
    width: 110,
    variant: "select",
    options: STATUS_OPTIONS.map((s) => ({ value: s, label: statusLabel(s) })),
  },
  { field: "progress", label: "Progress", width: 90, variant: "number", align: "right" },
  { field: "activities", label: "Activities", width: 120, variant: "text", align: "right" },
  { field: "gfa", label: "GFA (m²)", width: 110, variant: "number", align: "right" },
  { field: "action", label: "", width: 96, variant: "action" },
];

// ---------------------------------------------------------------------------
// View: which columns show (presets + per-user choice), depth, activities
// ---------------------------------------------------------------------------
/** Always shown; everything else can be switched off in View. */
export const FIXED_COLUMNS: WbsColumnKey[] = ["wbs_code", "wbs_name", "action"];

export const COLUMN_PRESETS: { id: string; label: string; columns: WbsColumnKey[] }[] = [
  { id: "standard", label: "Standard", columns: ["node_type", "discipline", "area_label", "cost_code", "status", "activities", "gfa"] },
  { id: "structure", label: "Structure", columns: ["node_type", "area_label", "status"] },
  { id: "cost", label: "Cost", columns: ["cost_code", "activities", "gfa"] },
  { id: "schedule", label: "Schedule", columns: ["discipline", "status", "progress", "activities"] },
  { id: "all", label: "All", columns: ["node_type", "discipline", "area_label", "cost_code", "status", "progress", "activities", "gfa"] },
];

export type WbsDepth = "all" | 1 | 2 | 3 | 4;

export interface WbsViewPrefs {
  /** Optional columns shown (FIXED_COLUMNS are always shown). */
  columns: WbsColumnKey[];
  depth: WbsDepth;
  showActivities: boolean;
}

export const DEFAULT_VIEW: WbsViewPrefs = { columns: COLUMN_PRESETS[0].columns, depth: 2, showActivities: false };

/** Columns to render, in their fixed order. */
export function visibleColumnsFor(columns: WbsColumnKey[]): WbsBuilderColumn[] {
  const on = new Set<WbsColumnKey>([...FIXED_COLUMNS, ...columns]);
  return WBS_BUILDER_COLUMNS.filter((c) => on.has(c.field));
}

export const ID_COL_WIDTH = 44;
export const ROW_HEIGHT = 34;
export const WBS_ROW_WIDTH =
  ID_COL_WIDTH + WBS_BUILDER_COLUMNS.reduce((sum, c) => sum + c.width, 0);

// ---------------------------------------------------------------------------
// User-resizable column widths
// ---------------------------------------------------------------------------
export type ColWidths = Record<WbsColumnKey, number>;

export const MIN_COL_WIDTH = 64;

export const DEFAULT_COL_WIDTHS: ColWidths = WBS_BUILDER_COLUMNS.reduce(
  (acc, c) => {
    acc[c.field] = c.width;
    return acc;
  },
  {} as ColWidths,
);

/** Total row width for a given set of column widths (incl. the # column). */
export function rowWidthFrom(widths: ColWidths, columns: WbsBuilderColumn[] = WBS_BUILDER_COLUMNS): number {
  return (
    ID_COL_WIDTH +
    columns.reduce((sum, c) => sum + (widths[c.field] ?? c.width), 0)
  );
}

// ---------------------------------------------------------------------------
// Synthetic project root row
// ---------------------------------------------------------------------------
/** The globally-selected project, shown as the always-present top row. */
export interface BuilderProject {
  id: string;
  project_code: string;
  project_name: string;
  project_status: string;
  progress_percentage: number;
}

export const PROJECT_NODE_TYPE = "project";

/** True for the synthetic project row — id is `project:<uuid>` (bare) or `node:project:<uuid>` (namespaced). */
export function isProjectRowId(id: string): boolean {
  return id.startsWith("project:") || id.startsWith("node:project:");
}

export function makeProjectNode(p: BuilderProject): WbsBuilderNode {
  return {
    id: `project:${p.id}`,
    project_id: p.id,
    parent_id: null,
    node_type: PROJECT_NODE_TYPE,
    wbs_code: p.project_code,
    wbs_name: p.project_name,
    full_path: p.project_code,
    sort_order: -1,
    status: p.project_status,
    progress_percent: p.progress_percentage ?? 0,
    discipline: null,
    area_label: null,
    cost_code: null,
    is_below_ground: null,
    is_external_works: null,
    is_locked: false,
    locked_at: null,
    locked_by: null,
  };
}

/**
 * Build the outline for react-arborist, sorted (sort_order, wbs_code). When a
 * `project` is given, every real top-level node is nested under a single
 * synthetic project row so the selected project is always row 1.
 */
export function buildWbsTree(
  nodes: WbsBuilderNode[],
  project?: BuilderProject | null,
): WbsBuilderRow[] {
  const knownIds = new Set(nodes.map((n) => n.id));
  const childrenByParent = new Map<string | null, WbsBuilderNode[]>();

  for (const n of nodes) {
    const key = n.parent_id && knownIds.has(n.parent_id) ? n.parent_id : null;
    const list = childrenByParent.get(key) ?? [];
    list.push(n);
    childrenByParent.set(key, list);
  }

  const sortLevel = (list: WbsBuilderNode[]) =>
    [...list].sort((a, b) => {
      const bySort = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (bySort !== 0) return bySort;
      return a.wbs_code.localeCompare(b.wbs_code);
    });

  const toRow = (n: WbsBuilderNode): WbsBuilderRow => ({
    id: `node:${n.id}`,
    node: n,
    children: sortLevel(childrenByParent.get(n.id) ?? []).map(toRow),
  });

  const roots = sortLevel(childrenByParent.get(null) ?? []).map(toRow);
  if (!project) return roots;

  return [
    {
      id: `node:project:${project.id}`,
      node: makeProjectNode(project),
      children: roots,
    },
  ];
}

/** Depth-first flatten (ignores collapse state) — drives the row-number column. */
export function flattenRows(rows: WbsBuilderRow[]): WbsBuilderRow[] {
  const out: WbsBuilderRow[] = [];
  const walk = (list: WbsBuilderRow[]) => {
    for (const r of list) {
      out.push(r);
      if (r.children.length) walk(r.children);
    }
  };
  walk(rows);
  return out;
}

// ---------------------------------------------------------------------------
// Activities: optional read-only rows + per-node roll-up
// ---------------------------------------------------------------------------
const bySortThenCode = (a: WbsActivitySummary, b: WbsActivitySummary) =>
  // Same order as Planning (sheet-utils sortTasks), so positional WBS codes match.
  (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.task_code ?? "").localeCompare(b.task_code ?? "");

/** The outline with each package's activities appended (after its child nodes) as `task:` rows. */
export function attachActivities(rows: WbsBuilderRow[], activities: WbsActivitySummary[]): WbsBuilderRow[] {
  const byNode = new Map<string, WbsActivitySummary[]>();
  for (const a of activities) {
    if (!a.wbs_node_id) continue;
    byNode.set(a.wbs_node_id, [...(byNode.get(a.wbs_node_id) ?? []), a]);
  }
  const walk = (list: WbsBuilderRow[]): WbsBuilderRow[] =>
    list.map((r) => {
      if (r.task) return r;
      const own = (byNode.get(r.node.id) ?? []).sort(bySortThenCode);
      return {
        ...r,
        children: [
          ...walk(r.children),
          ...own.map((task): WbsBuilderRow => ({ id: `task:${task.id}`, node: r.node, task, children: [] })),
        ],
      };
    });
  return walk(rows);
}

/** Depth of every row (the synthetic project row, when present, is 0). */
export function rowDepths(rows: WbsBuilderRow[]): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (list: WbsBuilderRow[], depth: number) => {
    for (const r of list) {
      out.set(r.id, depth);
      walk(r.children, depth + 1);
    }
  };
  walk(rows, 0);
  return out;
}

export interface ActivityRollup {
  count: number;
  /** Duration-weighted % complete of the activities under the node (0–100), null when none. */
  progress: number | null;
}

/** Activity count and % complete for every node, including everything below it. */
export function activityRollup(nodes: WbsBuilderNode[], activities: WbsActivitySummary[]): Map<string, ActivityRollup> {
  const parentOf = new Map(nodes.map((n) => [n.id, n.parent_id]));
  const acc = new Map<string, { count: number; weight: number; done: number }>();
  for (const a of activities) {
    const w = Math.max(1, Number(a.duration_days) || 1);
    const done = (Math.min(100, Math.max(0, Number(a.progress) || 0)) / 100) * w;
    let id: string | null | undefined = a.wbs_node_id;
    let guard = 0;
    while (id && guard++ < 64) {
      const cur = acc.get(id) ?? { count: 0, weight: 0, done: 0 };
      acc.set(id, { count: cur.count + 1, weight: cur.weight + w, done: cur.done + done });
      id = parentOf.get(id);
    }
  }
  const out = new Map<string, ActivityRollup>();
  for (const [id, v] of acc) out.set(id, { count: v.count, progress: v.weight ? Math.round((v.done / v.weight) * 100) : null });
  return out;
}

// ---------------------------------------------------------------------------
// Depth (View › Show levels)
// ---------------------------------------------------------------------------
/** Which rows start open for a depth: WBS levels above it, plus packages at it whose only children are activities. */
export function openMapFor(rows: WbsBuilderRow[], view: WbsViewPrefs): Record<string, boolean> {
  const depths = rowDepths(rows);
  const out: Record<string, boolean> = {};
  const walk = (list: WbsBuilderRow[]) => {
    for (const r of list) {
      if (!r.children.length) continue;
      const d = depths.get(r.id) ?? 0;
      const onlyActivities = r.children.every((c) => c.task);
      out[r.id] = view.depth === "all" || d < view.depth || (onlyActivities && d === view.depth);
      walk(r.children);
    }
  };
  walk(rows);
  return out;
}

export function countVisible(rows: WbsBuilderRow[], open: Record<string, boolean>): number {
  let n = 0;
  const walk = (list: WbsBuilderRow[]) => {
    for (const r of list) {
      n++;
      if (r.children.length && open[r.id] !== false) walk(r.children);
    }
  };
  walk(rows);
  return n;
}

// ---------------------------------------------------------------------------
// WBS code shown in the grid (same rule as Planning's schedule)
// ---------------------------------------------------------------------------
/**
 * Full WBS code per row: the saved `wbs_outline_code` override when set, else computed from the
 * row's outline position (child packages first, then activities) and the project's code mask —
 * exactly what Planning shows. Pass the outline WITH activities attached so activity codes and
 * positions match; the synthetic project row is keyed but shows the project code instead.
 */
export function wbsDisplayCodes(rows: WbsBuilderRow[], mask: WbsCodeMask): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (list: WbsBuilderRow[], path: number[]) => {
    list.forEach((r, i) => {
      const isProject = !r.task && r.node.node_type === PROJECT_NODE_TYPE;
      const here = isProject ? [] : [...path, i + 1];
      const override = r.task ? r.task.wbs_outline_code : r.node.wbs_outline_code;
      if (!isProject) out.set(r.id, override || computeWbsCode(here, mask));
      walk(r.children, here);
    });
  };
  walk(rows, []);
  return out;
}
