// Types + column definitions for the WBS Builder — an Excel / MS-Project-style
// editable grid over `wbs_nodes`. Every row is a wbs_nodes row (no task rows,
// no synthetic project root, no container node).

import type { HierNode } from "@/lib/wbs-hierarchy";

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
  is_below_ground: boolean | null;
  is_external_works: boolean | null;
  is_locked: boolean;
  locked_at: string | null;
  locked_by: string | null;
}

export const NODE_COLS =
  "id, project_id, parent_id, node_type, wbs_code, wbs_name, full_path, sort_order, status, progress_percent, is_below_ground, is_external_works, is_locked, locked_at, locked_by";

/** One row of the outline handed to react-arborist. */
export interface WbsBuilderRow {
  id: `node:${string}`;
  node: WbsBuilderNode;
  children: WbsBuilderRow[];
}

/** Editable, keyboard-navigable cell fields (drive `updateNodeField`). */
export type WbsBuilderField = "wbs_code" | "node_type" | "wbs_name" | "status";

/** Every column key, including the non-editable GFA + Action columns. */
export type WbsColumnKey = WbsBuilderField | "gfa" | "action";

/** Columns navigable left/right by keyboard, in visual order. */
export const NAV_COLUMNS: WbsBuilderField[] = ["wbs_code", "node_type", "wbs_name", "status"];

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
  { field: "node_type", label: "Node Type", width: 160, variant: "select", options: NODE_TYPE_OPTIONS },
  { field: "wbs_name", label: "Name", width: 380, variant: "text" },
  {
    field: "status",
    label: "Status",
    width: 120,
    variant: "select",
    options: STATUS_OPTIONS.map((s) => ({ value: s, label: statusLabel(s) })),
  },
  { field: "gfa", label: "GFA (m²)", width: 120, variant: "number", align: "right" },
  { field: "action", label: "", width: 96, variant: "action" },
];

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
export function rowWidthFrom(widths: ColWidths): number {
  return (
    ID_COL_WIDTH +
    WBS_BUILDER_COLUMNS.reduce((sum, c) => sum + (widths[c.field] ?? c.width), 0)
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
