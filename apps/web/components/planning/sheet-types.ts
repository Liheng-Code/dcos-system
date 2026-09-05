// Types for the Planning ▸ Schedule — an MS-Project-style editable task grid
// paired with a Gantt timeline (see plan-schedule-view.tsx).

/** A row from `wbs_tasks` (explicit subset — database.types.ts is stale). */
export interface SheetTask {
  id: string;
  project_id: string;
  wbs_node_id: string;
  task_code: string;
  task_name: string;
  start_date: string | null;
  end_date: string | null;
  progress: number;
  status: string;
  sort_order: number;
  is_milestone: boolean | null;
  // --- scheduling ---
  dependency_task_ids: string[] | null;
  dependency_types: string[] | null;
  dependency_lag_days: number[] | null;
  constraint_type: string | null;
  constraint_date: string | null;
  manually_scheduled: boolean;
  baseline_start_date: string | null;
  baseline_finish_date: string | null;
  delay_status: string | null;
  /** Persisted / hand-edited MS-Project WBS code; null = use the computed one. */
  wbs_outline_code: string | null;
}

/** A row from `wbs_nodes` (explicit subset). */
export interface SheetNode {
  id: string;
  project_id: string;
  parent_id: string | null;
  node_type: string;
  wbs_code: string;
  wbs_name: string;
  sort_order: number | null;
  is_locked?: boolean;
  wbs_outline_code?: string | null;
}

/** The globally-selected project — shown as the always-present top row. */
export interface SheetProject {
  id: string;
  project_code: string;
  project_name: string;
  progress_percentage: number;
}

/**
 * node_type of the synthetic top row that stands in for the whole project.
 * Its node id is `project:<uuid>` and its arborist row id is `node:project:<uuid>`.
 */
export const PROJECT_NODE_TYPE = "project";

/** One row of the unified outline given to react-arborist. */
export type SheetRow =
  | {
      id: `node:${string}`;
      kind: "node";
      node: SheetNode;
      /** client-computed rollup from descendant tasks */
      rollup: { progress: number; start: string | null; end: string | null; taskCount: number };
      children: SheetRow[];
    }
  | {
      id: `task:${string}`;
      kind: "task";
      task: SheetTask;
      children: SheetRow[]; // always []
    };

export type SheetField =
  | "mode"
  | "wbs"
  | "code"
  | "name"
  | "duration"
  | "start"
  | "finish"
  | "predecessors"
  | "progress"
  | "status";

/** Columns navigable by keyboard, in visual order (row-number "#" column excluded). */
export const NAV_COLUMNS: SheetField[] = [
  "wbs",
  "code",
  "name",
  "duration",
  "start",
  "finish",
  "predecessors",
  "progress",
  "status",
];

export interface SheetColumn {
  field: SheetField;
  label: string;
  width: number;
  variant: "text" | "number" | "date" | "select" | "icon";
  align?: "left" | "right";
  options?: { value: string; label: string }[];
  mono?: boolean;
}

/** Statuses a user may set by hand in the grid (workflow-driven values excluded). */
export const EDITABLE_STATUSES = [
  "open",
  "in_progress",
  "paused",
  "blocked",
  "review",
  "completed",
  "cancelled",
] as const;

export const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  paused: "Paused",
  blocked: "Blocked",
  review: "Review",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const STATUS_OPTIONS = EDITABLE_STATUSES.map((s) => ({
  value: s,
  label: STATUS_LABELS[s] ?? s,
}));

export const SHEET_COLUMNS: SheetColumn[] = [
  { field: "mode", label: "", width: 28, variant: "icon" },
  { field: "wbs", label: "WBS", width: 96, variant: "text", mono: true },
  { field: "code", label: "Code", width: 92, variant: "text", mono: true },
  { field: "name", label: "Task Name", width: 300, variant: "text" },
  { field: "duration", label: "Dur (d)", width: 68, variant: "number", align: "right" },
  { field: "start", label: "Start", width: 122, variant: "date" },
  { field: "finish", label: "Finish", width: 122, variant: "date" },
  { field: "predecessors", label: "Predecessors", width: 140, variant: "text", mono: true },
  { field: "progress", label: "%", width: 52, variant: "number", align: "right" },
  { field: "status", label: "Status", width: 120, variant: "select", options: STATUS_OPTIONS },
];

export const ID_COL_WIDTH = 44;
export const ROW_HEIGHT = 32;

/**
 * Shared header height for BOTH panes — the grid header and the Gantt date
 * header must line up exactly or every row is offset. Do not import
 * `HEADER_H` from gantt-types here; that value (48) belongs to the older
 * standalone chart.
 */
export const SCHEDULE_HEADER_H = 48;

export const SHEET_ROW_WIDTH =
  ID_COL_WIDTH + SHEET_COLUMNS.reduce((sum, c) => sum + c.width, 0);

// ---------------------------------------------------------------------------
// Resizable columns (same machinery as the WBS Builder grid)
// ---------------------------------------------------------------------------
export type ColWidths = Record<SheetField, number>;

export const MIN_COL_WIDTH = 28;

export const COL_WIDTHS_KEY = "dcos_plan_schedule_col_widths";

export const DEFAULT_COL_WIDTHS: ColWidths = SHEET_COLUMNS.reduce((acc, c) => {
  acc[c.field] = c.width;
  return acc;
}, {} as ColWidths);

export function rowWidthFrom(widths: ColWidths): number {
  return (
    ID_COL_WIDTH +
    SHEET_COLUMNS.reduce((sum, c) => sum + (widths[c.field] ?? c.width), 0)
  );
}

export function loadColWidths(): ColWidths {
  if (typeof window === "undefined") return DEFAULT_COL_WIDTHS;
  try {
    const raw = window.localStorage.getItem(COL_WIDTHS_KEY);
    if (!raw) return DEFAULT_COL_WIDTHS;
    const parsed = JSON.parse(raw) as Partial<ColWidths>;
    const next = { ...DEFAULT_COL_WIDTHS };
    for (const c of SHEET_COLUMNS) {
      const v = parsed[c.field];
      if (typeof v === "number" && v >= MIN_COL_WIDTH) next[c.field] = v;
    }
    return next;
  } catch {
    return DEFAULT_COL_WIDTHS;
  }
}
