// Pure helpers for the Planning ▸ Schedule grid.
//
// Date math is WORKING-DAY based and delegates to lib/planning/work-calendar.ts,
// so durations skip weekends and holidays from the project's plan_calendars row.

import {
  finishFromStart,
  nextWorkingDay,
  parseISO as parseISOUtc,
  workingDaysBetween,
  type WorkCalendar,
} from "@/lib/planning/work-calendar";
import {
  PROJECT_NODE_TYPE,
  type SheetNode,
  type SheetProject,
  type SheetRow,
  type SheetTask,
} from "./sheet-types";

// ---------------------------------------------------------------------------
// Dates (UTC-pinned so <input type="date"> strings don't drift by timezone)
// ---------------------------------------------------------------------------
export {
  todayISO,
  isValidISO,
  parseISO,
  addCalendarDays as addDays,
  calendarDaysBetween as diffDaysInclusive,
} from "@/lib/planning/work-calendar";

/** Duration in WORKING days, or null when either date is missing. */
export function durationOf(
  task: Pick<SheetTask, "start_date" | "end_date" | "is_milestone">,
  cal: WorkCalendar,
): number | null {
  if (!task.start_date || !task.end_date) return null;
  if (task.is_milestone) return 0;
  return workingDaysBetween(cal, task.start_date, task.end_date);
}

// ---------------------------------------------------------------------------
// Duration ↔ date recalculation. Returns the DB patch for a single-cell edit.
// ---------------------------------------------------------------------------
export type SchedulePatch = Partial<
  Pick<SheetTask, "start_date" | "end_date" | "is_milestone">
>;

export function recalcOnStart(
  task: SheetTask,
  newStart: string,
  cal: WorkCalendar,
): SchedulePatch {
  const start = nextWorkingDay(cal, newStart, 1);
  const dur = durationOf(task, cal) ?? 1;
  return { start_date: start, end_date: finishFromStart(cal, start, dur) };
}

/** Returns the patch plus whether the finish was clamped to the start. */
export function recalcOnFinish(
  task: SheetTask,
  newFinish: string,
  cal: WorkCalendar,
): { patch: SchedulePatch; clamped: boolean } {
  const finish = nextWorkingDay(cal, newFinish, -1);
  const start = task.start_date;
  if (!start) {
    // No start yet — seed a 1-day activity ending on the entered finish.
    return { patch: { start_date: finish, end_date: finish }, clamped: false };
  }
  if (parseISOUtc(finish).getTime() < parseISOUtc(start).getTime()) {
    return { patch: { end_date: start, is_milestone: true }, clamped: true };
  }
  return { patch: { end_date: finish, is_milestone: false }, clamped: false };
}

/**
 * `null` = invalid duration input. `seededStart` is set when a null start was
 * auto-filled. A duration of 0 turns the task into a milestone.
 */
export function recalcOnDuration(
  task: SheetTask,
  raw: string,
  fallbackStart: string,
  cal: WorkCalendar,
): { patch: SchedulePatch; seededStart: string | null } | null {
  const d = Math.floor(Number(raw));
  if (!Number.isFinite(d) || d < 0 || raw.trim() === "") return null;
  const start = nextWorkingDay(cal, task.start_date ?? fallbackStart, 1);
  const seededStart = task.start_date ? null : start;
  return {
    patch: {
      start_date: start,
      end_date: finishFromStart(cal, start, d),
      is_milestone: d === 0,
    },
    seededStart,
  };
}

// ---------------------------------------------------------------------------
// Code / sort-order allocation
// ---------------------------------------------------------------------------
const TASK_CODE_RE = /^T(\d+)$/;

export function nextTaskCode(tasks: Pick<SheetTask, "task_code">[]): string {
  let max = 0;
  for (const t of tasks) {
    const m = TASK_CODE_RE.exec(t.task_code ?? "");
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return "T" + String(max + 1).padStart(4, "0");
}

/** Monotonic sort_order allocator — Date.now() repeats within a fast loop. */
export function makeSortAllocator(): () => number {
  let last = 0;
  return () => (last = Math.max(Date.now(), last + 1));
}

/** A code unique among a set of sibling codes (case-insensitive), suffixing -2, -3… */
export function uniqueSiblingCode(base: string, taken: Set<string>): string {
  const lower = new Set([...taken].map((c) => c.toLowerCase()));
  if (!lower.has(base.toLowerCase())) return base;
  let n = 2;
  while (lower.has(`${base}-${n}`.toLowerCase())) n++;
  return `${base}-${n}`;
}

// ---------------------------------------------------------------------------
// Unified outline tree
// ---------------------------------------------------------------------------
function sortNodesInPlace(list: SheetNode[]): SheetNode[] {
  return [...list].sort((a, b) => {
    const bySort = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (bySort !== 0) return bySort;
    return a.wbs_code.localeCompare(b.wbs_code);
  });
}

function sortTasks(list: SheetTask[]): SheetTask[] {
  return [...list].sort((a, b) => {
    const bySort = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (bySort !== 0) return bySort;
    return a.task_code.localeCompare(b.task_code);
  });
}

/**
 * Date range + count only — progress is NOT derived here. It comes straight
 * from the server (`wbs_nodes.progress_percent` / `projects.progress_percentage`,
 * maintained by `recalculate_wbs_progress()`), which is the app-wide,
 * budget-cost-weighted source of truth also used by WBS Builder and the
 * dashboard. Callers attach `progress` themselves — see `toNodeRow` below.
 */
function rollup(tasks: SheetTask[]): { start: string | null; end: string | null; taskCount: number } {
  if (tasks.length === 0) return { start: null, end: null, taskCount: 0 };
  const starts = tasks.map((t) => t.start_date).filter(Boolean).sort() as string[];
  const ends = tasks.map((t) => t.end_date).filter(Boolean).sort() as string[];
  return {
    start: starts[0] ?? null,
    end: ends[ends.length - 1] ?? null,
    taskCount: tasks.length,
  };
}

/**
 * Build the outline: WBS node rows (summary) with their child node rows first,
 * then their task rows. Orphan tasks (missing/unknown wbs_node_id) hang under
 * the container node visually. Node rollups aggregate ALL descendant tasks.
 *
 * When `project` is given, every real root is nested under a synthetic,
 * read-only project row so the whole programme has a single MS-Project-style
 * top line.
 */
export function buildSheetTree(
  nodes: SheetNode[],
  tasks: SheetTask[],
  containerNodeId: string | null,
  project?: SheetProject | null,
): SheetRow[] {
  const childNodes = new Map<string | null, SheetNode[]>();
  for (const n of nodes) {
    const key = n.parent_id && nodes.some((x) => x.id === n.parent_id) ? n.parent_id : null;
    const list = childNodes.get(key) ?? [];
    list.push(n);
    childNodes.set(key, list);
  }

  const tasksByNode = new Map<string, SheetTask[]>();
  const knownNodeIds = new Set(nodes.map((n) => n.id));
  const orphanTasks: SheetTask[] = [];
  for (const t of tasks) {
    if (t.wbs_node_id && knownNodeIds.has(t.wbs_node_id)) {
      const list = tasksByNode.get(t.wbs_node_id) ?? [];
      list.push(t);
      tasksByNode.set(t.wbs_node_id, list);
    } else {
      orphanTasks.push(t);
    }
  }

  const descendantTasks = (nodeId: string): SheetTask[] => {
    const own = tasksByNode.get(nodeId) ?? [];
    const kids = childNodes.get(nodeId) ?? [];
    return [...own, ...kids.flatMap((k) => descendantTasks(k.id))];
  };

  const toNodeRow = (n: SheetNode): SheetRow => {
    const childNodeRows = sortNodesInPlace(childNodes.get(n.id) ?? []).map(toNodeRow);
    let taskRows: SheetRow[] = sortTasks(tasksByNode.get(n.id) ?? []).map((t) => ({
      id: `task:${t.id}` as const,
      kind: "task" as const,
      task: t,
      children: [] as SheetRow[],
    }));
    if (containerNodeId && n.id === containerNodeId && orphanTasks.length > 0) {
      taskRows = [
        ...taskRows,
        ...sortTasks(orphanTasks).map((t) => ({
          id: `task:${t.id}` as const,
          kind: "task" as const,
          task: t,
          children: [] as SheetRow[],
        })),
      ];
    }
    return {
      id: `node:${n.id}` as const,
      kind: "node" as const,
      node: n,
      rollup: { ...rollup(descendantTasks(n.id)), progress: n.progress_percent ?? 0 },
      children: [...childNodeRows, ...taskRows],
    };
  };

  const roots = sortNodesInPlace(childNodes.get(null) ?? []).map(toNodeRow);

  // Orphan tasks with no container node yet → surface them at the top level.
  if (!containerNodeId && orphanTasks.length > 0) {
    roots.push(
      ...sortTasks(orphanTasks).map((t) => ({
        id: `task:${t.id}` as const,
        kind: "task" as const,
        task: t,
        children: [] as SheetRow[],
      })),
    );
  }

  if (!project) return roots;

  const projectNode: SheetNode = {
    id: `project:${project.id}`,
    project_id: project.id,
    parent_id: null,
    node_type: PROJECT_NODE_TYPE,
    wbs_code: project.project_code || "PROJ",
    wbs_name: project.project_name || "Project",
    sort_order: -1,
    progress_percent: project.progress_percentage ?? 0,
  };
  return [
    {
      id: `node:project:${project.id}` as const,
      kind: "node" as const,
      node: projectNode,
      rollup: { ...rollup(tasks), progress: project.progress_percentage ?? 0 },
      children: roots,
    },
  ];
}

/** Depth-first flatten (ignores collapse state) — used for the row-number column. */
export function flattenRows(rows: SheetRow[]): SheetRow[] {
  const out: SheetRow[] = [];
  const walk = (list: SheetRow[]) => {
    for (const r of list) {
      out.push(r);
      if (r.children.length) walk(r.children);
    }
  };
  walk(rows);
  return out;
}

export interface VisibleRow {
  row: SheetRow;
  depth: number;
}

/**
 * Rows that should start collapsed so a large import doesn't render thousands
 * of rows at once: every summary row with children at depth >= `minDepth`
 * (depth 0 = project, 1 = phases, 2 = packages …). Used to seed both the
 * grid's arborist open-state and the view's `collapsedIds`.
 */
export const DEFAULT_COLLAPSE_DEPTH = 2;

export function autoCollapsedIds(
  rows: SheetRow[],
  minDepth: number = DEFAULT_COLLAPSE_DEPTH,
): Set<string> {
  const ids = new Set<string>();
  const walk = (list: SheetRow[], depth: number) => {
    for (const r of list) {
      if (r.children.length === 0) continue;
      if (depth >= minDepth) ids.add(r.id);
      walk(r.children, depth + 1);
    }
  };
  walk(rows, 0);
  return ids;
}

/**
 * Depth-first flatten that RESPECTS collapse state. Drives both the grid and
 * the timeline, so the two panes always render the same rows in the same order.
 */
export function visibleRowsFrom(rows: SheetRow[], collapsedIds: Set<string>): VisibleRow[] {
  const out: VisibleRow[] = [];
  const walk = (list: SheetRow[], depth: number) => {
    for (const r of list) {
      out.push({ row: r, depth });
      if (r.children.length && !collapsedIds.has(r.id)) walk(r.children, depth + 1);
    }
  };
  walk(rows, 0);
  return out;
}

/**
 * Drops task rows at 100% complete, plus any summary row left with no
 * children as a result (the project's own row always stays, even empty, so
 * the grid isn't left blank). Powers the Sheet toolbar's "Hide Completed" filter.
 */
export function filterIncomplete(rows: SheetRow[]): SheetRow[] {
  const walk = (list: SheetRow[]): SheetRow[] =>
    list.reduce<SheetRow[]>((acc, r) => {
      if (r.kind === "task") {
        if (r.task.progress < 100) acc.push(r);
        return acc;
      }
      const children = walk(r.children);
      if (children.length > 0 || r.node.node_type === PROJECT_NODE_TYPE) {
        acc.push({ ...r, children });
      }
      return acc;
    }, []);
  return walk(rows);
}

// ---------------------------------------------------------------------------
// Arborist hierarchy helpers (adapted from wbs-management-page.tsx)
// ---------------------------------------------------------------------------
export interface HierMove {
  parentId: string | null;
  sortOrder: number;
  reorderedSiblings: Array<{ id: string; sortOrder: number }>;
}

export function normalizeArboristParentId(parentId: string | null): string | null {
  if (!parentId) return null;
  // arborist's internal root, and our synthetic project node, both mean "top level".
  if (parentId === "__REACT_ARBORIST_INTERNAL_ROOT__" || parentId.startsWith("project:")) {
    return null;
  }
  return parentId;
}

function orderedSiblings(nodes: SheetNode[], parentId: string | null): SheetNode[] {
  return nodes
    .filter((n) => (n.parent_id ?? null) === parentId)
    .sort((a, b) => {
      const bySort = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (bySort !== 0) return bySort;
      const byCode = a.wbs_code.localeCompare(b.wbs_code);
      return byCode !== 0 ? byCode : a.id.localeCompare(b.id);
    });
}

function reindex(nodes: SheetNode[]): Array<{ id: string; sortOrder: number }> {
  return nodes.map((n, i) => ({ id: n.id, sortOrder: i * 10 }));
}

export function getDescendantNodeIds(nodes: SheetNode[], id: string): string[] {
  const kids = orderedSiblings(nodes, id);
  return kids.flatMap((k) => [k.id, ...getDescendantNodeIds(nodes, k.id)]);
}

/** Compute a node re-parent/reorder move, or null if illegal (cycle). */
export function getNodeMove(
  nodes: SheetNode[],
  id: string,
  rawParentId: string | null,
  index: number,
): HierMove | null {
  const selected = nodes.find((n) => n.id === id);
  if (!selected) return null;
  const parentId = normalizeArboristParentId(rawParentId);
  if (parentId === id || (parentId && getDescendantNodeIds(nodes, id).includes(parentId))) return null;

  const source = reindex(orderedSiblings(nodes, selected.parent_id ?? null).filter((n) => n.id !== id));
  const target = orderedSiblings(nodes, parentId).filter((n) => n.id !== id);
  const at = Math.max(0, Math.min(index, target.length));
  const nextOrder = [...target.slice(0, at), selected, ...target.slice(at)];
  const targetUpdates = reindex(nextOrder);
  const selfUpdate = targetUpdates.find((n) => n.id === id);
  if (!selfUpdate) return null;

  const byId = new Map<string, { id: string; sortOrder: number }>();
  for (const u of [...source, ...targetUpdates]) byId.set(u.id, u);
  return { parentId, sortOrder: selfUpdate.sortOrder, reorderedSiblings: [...byId.values()] };
}
