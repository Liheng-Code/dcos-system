"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  buildWorkCalendar,
  DEFAULT_CALENDAR,
  nextWorkingDay,
  workingDaysBetween,
  type PlanCalendarExceptionRow,
  type PlanCalendarRow,
  type WorkCalendar,
} from "@/lib/planning/work-calendar";
import {
  depsFromArrays,
  depsToArrays,
  scheduleProject,
  wouldCycle,
  DEFAULT_FLOAT_THRESHOLDS,
  type DepType,
  type EngineDep,
  type EngineTask,
  type FloatThresholds,
  type TaskFloat,
} from "@/lib/planning/schedule-engine";
import { computeScheduleKpis, type ScheduleKpis } from "@/lib/planning/schedule-kpis";
import { logScheduleAudit, logScheduleFieldChanges, type ScheduleAuditAction } from "@/lib/planning/schedule-audit";
import {
  DEFAULT_PROGRESS_LINE_STYLE,
  type ProgressLineDateSource,
  type ProgressLinePointShape,
  type ProgressLineStyle,
} from "./gantt-progress-line";
import { DEFAULT_BAR_STYLE, type GanttBarStyleSettings } from "@/lib/planning/gantt-bar-style";
import { parsePredecessors } from "@/lib/planning/predecessor-syntax";
import { addAssignment, findOrCreateResourceForProfile } from "@/lib/planning/resource-service";
import {
  computeWbsCode,
  DEFAULT_MASK,
  maskFromRow,
  type WbsCodeMask,
  type WbsMaskRow,
} from "@/lib/planning/wbs-code-mask";
import {
  PROJECT_NODE_TYPE,
  type SheetField,
  type SheetNode,
  type SheetProject,
  type SheetRow,
  type SheetTask,
} from "./sheet-types";
import {
  buildSheetTree,
  flattenRows,
  getDescendantNodeIds,
  getNodeMove,
  isValidISO,
  makeSortAllocator,
  nextTaskCode,
  recalcOnDuration,
  recalcOnFinish,
  recalcOnStart,
  todayISO,
  uniqueSiblingCode,
} from "./sheet-utils";
import { advanceDataDateRpc, applyScheduleDates, applyWbsCodes, deleteWbsNodeByIdReturning, deleteWbsTaskByIdReturning, getPlanCalendarByProjectId, getPlanScheduleSettingByProjectId, getPlanWbsCodeMaskByProjectId, getProjectById, getWbsNodeByProjectIdWithParentIdAndNodeTypeTaskGroupAndWbsCodeTASKS, getWbsNodeByProjectIdWithParentIdAndWbsCodeTASKS, getWeeklyPlanByProjectIdWithStatusApproved, insertWbsNodeReturning, insertWbsTasksReturning, listPlanCalendarExceptionsByCalendarIdLimited, listWbsNodesByProjectIdOrderedBySortOrder, listWbsTaskProgressReviewsByProjectIdWithStatusPendingOfWbsTaskId, listWbsTasksByProjectIdOfTaskCode, listWbsTasksByProjectIdOrderedBySortOrder, submitProgress, updateWbsNodeById, updateWbsTaskById, upsertPlanScheduleSetting } from "@/lib/planning/planning-queries";

const TASK_COLS =
  "id, project_id, wbs_node_id, task_code, task_name, start_date, end_date, progress, status, " +
  "sort_order, is_milestone, dependency_task_ids, dependency_types, dependency_lag_days, " +
  "constraint_type, constraint_date, manually_scheduled, baseline_start_date, " +
  "baseline_finish_date, delay_status, wbs_outline_code, discipline, owner_id, owner_name, priority";
const NODE_COLS =
  "id, project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, is_locked, wbs_outline_code, " +
  "progress_percent";

const LOCK_TOAST =
  "Locked — this WBS branch is a Planning backbone. Unlock it in the WBS module to edit.";
const TASK_LIMIT = 1000;
const NODE_LIMIT = 2000;
const CALENDAR_EXCEPTION_LIMIT = 5000;

function isDuplicateTaskCodeError(message: string) {
  return (
    message.includes("wbs_tasks_project_id_task_code_key") ||
    message.toLowerCase().includes("duplicate key")
  );
}

function findContainer(nodes: SheetNode[]): string | null {
  return (
    nodes.find(
      (n) => !n.parent_id && n.node_type === "task_group" && n.wbs_code === "TASKS",
    )?.id ?? null
  );
}

/** Map the grid's task rows onto the scheduling engine's input shape. */
function toEngineTasks(tasks: SheetTask[], cal: WorkCalendar): EngineTask[] {
  return tasks.map((t) => {
    let durationWd = 1;
    if (t.is_milestone) durationWd = 0;
    else if (t.start_date && t.end_date)
      durationWd = Math.max(1, workingDaysBetween(cal, t.start_date, t.end_date));
    return {
      id: t.id,
      start: t.start_date,
      finish: t.end_date,
      durationWd,
      manuallyScheduled: t.manually_scheduled,
      constraintType: t.constraint_type,
      constraintDate: t.constraint_date,
      deps: depsFromArrays(
        t.dependency_task_ids,
        t.dependency_types,
        t.dependency_lag_days,
      ),
    };
  });
}

export interface SheetActions {
  createTask: (name: string, afterRowId: string | null) => Promise<void>;
  updateTaskField: (taskId: string, field: SheetField, raw: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  createNode: (name: string, parentNodeId: string | null) => Promise<void>;
  renameNode: (nodeId: string, name: string) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  indentRow: (rowId: string) => Promise<void>;
  outdentRow: (rowId: string) => Promise<void>;
  moveRow: (dragId: string, parentId: string | null, index: number) => Promise<void>;
  // --- scheduling ---
  setPredecessors: (taskId: string, raw: string) => Promise<void>;
  linkTasks: (predId: string, succId: string, type?: DepType, lag?: number) => Promise<void>;
  updateLink: (succId: string, index: number, type: DepType, lag: number) => Promise<void>;
  removeLink: (succId: string, index: number) => Promise<void>;
  rescheduleTask: (taskId: string, start: string, finish: string) => Promise<void>;
  /** Set % complete (optimistic + debounced persist) — for wheel-over-bar. */
  setProgress: (taskId: string, pct: number) => void;
  toggleMilestone: (taskId: string) => Promise<void>;
  toggleManualSchedule: (taskId: string) => Promise<void>;
  setConstraint: (taskId: string, type: string | null, date: string | null) => Promise<void>;
  /** Assign a real team member to a task — mirrors into Planning's resource system too. */
  assignOwner: (taskId: string, profile: { id: string; full_name: string | null }) => Promise<void>;
  runAutoSchedule: () => Promise<void>;
  /** Persist the computed WBS code onto every row (Renumber). Pass a mask to
   *  use instead of the currently-loaded one (e.g. right after saving it). */
  renumberWbsCodes: (mask?: WbsCodeMask) => Promise<void>;
  /** Hand-edit one row's WBS code (`wbs_outline_code` override). */
  setWbsCode: (rowId: string, raw: string) => Promise<void>;
}

export interface UseSheetData {
  loading: boolean;
  tree: SheetRow[];
  flatRows: SheetRow[];
  rowNumberById: Map<string, number>;
  tasks: SheetTask[];
  taskById: Map<string, SheetTask>;
  taskCount: number;
  capped: boolean;
  nextCodePreview: string;
  project: SheetProject | null;
  calendar: WorkCalendar;
  dataDate: string | null;
  float: Map<string, TaskFloat>;
  violations: Map<string, string>;
  scheduleError: string | null;
  /** Dashboard/toolbar headline numbers (Completion Plan 1.4 / 1.5). */
  kpis: ScheduleKpis;
  /** Task ids with a pending progress-review row (Completion Plan 2.2) — drives the Sheet's pending badge. */
  pendingProgressReviewTaskIds: Set<string>;
  /** Moves the project's schedule data date forward and re-snapshots progress (Completion Plan F2 / 1.2). Throws on failure. */
  advanceDataDate: (newDate: string, note?: string) => Promise<void>;
  /** Row ids (`task:<id>` / `node:<id>`) under a locked WBS backbone — read-only. */
  lockedRowIds: Set<string>;
  /** Task ids under a locked WBS backbone — for the timeline. */
  lockedTaskIds: Set<string>;
  /** MS-Project WBS code definition for this project. */
  wbsCodeMask: WbsCodeMask;
  /** Row id (`task:<id>` / `node:<id>`) → its displayed WBS code. */
  wbsCodeByRowId: Map<string, string>;
  autoSchedule: boolean;
  setAutoSchedule: (v: boolean) => void;
  /** Auto-schedule is off and a schedule-affecting edit is pending (needs Calculate). */
  calcNeeded: boolean;
  /** Per-project critical / near-critical float cutoffs (days) — drives `float`'s `critical`/`nearCritical` flags. */
  floatThresholds: FloatThresholds;
  updateFloatThresholds: (next: FloatThresholds) => Promise<void>;
  /** Per-project progress-line style (date source, colors, marker shape). Visibility itself is a client-side toggle. */
  progressLineStyle: ProgressLineStyle;
  updateProgressLineSettings: (next: ProgressLineStyle) => Promise<void>;
  /** Per-project Gantt bar appearance (color/shape by category, text label positions). Edited via double-click "Format Bar". */
  barStyle: GanttBarStyleSettings;
  updateBarStyle: (next: GanttBarStyleSettings) => Promise<void>;
  reload: () => Promise<void>;
  actions: SheetActions;
}

export function useSheetData(
  projectId: string,
  isManager = false,
  /**
   * When set, the grid + timeline render every task's dates from this
   * `taskId → { start, end }` map instead of the live values, and ALL write
   * actions become no-ops (a "read-only" toast). Used by the Gantt "View"
   * selector to look at a saved schedule revision without editing it.
   */
  overrideDates?: Map<string, { start: string | null; end: string | null }> | null,
  /**
   * When `false`, the mount/project-change effect below does not auto-fetch —
   * the caller drives loading entirely via `reload()`. Every existing call
   * site fetches immediately as before (default `true`); the Planning
   * Dashboard is the one caller that passes `false`, so it can restore a
   * cached snapshot instantly and only hit the network on an explicit
   * Refresh (see `app/dashboard/planning/page.tsx`).
   */
  enabled = true,
): UseSheetData {
  const supabase = useMemo(() => createClient(), []);
  const [tasks, setTasks] = useState<SheetTask[]>([]);
  const [nodes, setNodes] = useState<SheetNode[]>([]);
  const [project, setProject] = useState<SheetProject | null>(null);
  const [dataDate, setDataDate] = useState<string | null>(null);
  const [containerId, setContainerId] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<WorkCalendar>(DEFAULT_CALENDAR);
  const [wbsCodeMask, setWbsCodeMask] = useState<WbsCodeMask>(DEFAULT_MASK);
  const [floatThresholds, setFloatThresholds] = useState<FloatThresholds>(DEFAULT_FLOAT_THRESHOLDS);
  const [progressLineStyle, setProgressLineStyle] = useState<ProgressLineStyle>(DEFAULT_PROGRESS_LINE_STYLE);
  const [barStyle, setBarStyle] = useState<GanttBarStyleSettings>(DEFAULT_BAR_STYLE);
  const [loading, setLoading] = useState(true);
  const [autoSchedule, setAutoSchedule] = useState(true);
  const [calcNeeded, setCalcNeeded] = useState(false);
  /** PCR from the most recently closed weekly plan (Completion Plan 1.8's close_weekly_plan()). Null until one has been closed. */
  const [weeklyPlanPcr, setWeeklyPlanPcr] = useState<number | null>(null);
  /** Task ids with a pending wbs_task_progress_reviews row (Completion Plan 2.2) — drives the Sheet's pending badge. */
  const [pendingProgressReviewTaskIds, setPendingProgressReviewTaskIds] = useState<Set<string>>(new Set());

  const nextSort = useRef(makeSortAllocator()).current;
  /** Debounce timer for the schedule-alert evaluation call (Completion Plan 1.6) — coalesces a burst of edits into one evaluation. */
  const alertEvalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerPromise = useRef<Promise<string> | null>(null);
  const warnedNoCalendar = useRef<string | null>(null);
  // Latest state for use inside async callbacks without stale closures.
  const tasksRef = useRef(tasks);
  const nodesRef = useRef(nodes);
  const calendarRef = useRef(calendar);
  const autoScheduleRef = useRef(autoSchedule);
  /** Acting user id for wbs_audit_log rows (Completion Plan 1.1) — fetched once, read synchronously from write paths. */
  const currentUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      currentUserIdRef.current = data.user?.id ?? null;
    });
  }, [supabase]);
  useEffect(() => () => { if (alertEvalTimer.current) clearTimeout(alertEvalTimer.current); }, []);

  // Node ids that are, or descend from, a locked WBS node. Drives the read-only
  // treatment for everyone (mirrors the WBS Builder); the edit guards below let
  // admins / project managers through at the data layer.
  const lockedNodeIds = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const cache = new Map<string, boolean>();
    const resolve = (id: string): boolean => {
      const hit = cache.get(id);
      if (hit !== undefined) return hit;
      cache.set(id, false); // guard against a malformed cycle
      const n = byId.get(id);
      const v =
        !!n && (n.is_locked === true || (n.parent_id ? resolve(n.parent_id) : false));
      cache.set(id, v);
      return v;
    };
    const out = new Set<string>();
    for (const n of nodes) if (resolve(n.id)) out.add(n.id);
    return out;
  }, [nodes]);
  const lockedNodeIdsRef = useRef(lockedNodeIds);
  const isManagerRef = useRef(isManager);

  useEffect(() => {
    tasksRef.current = tasks;
    nodesRef.current = nodes;
    calendarRef.current = calendar;
    autoScheduleRef.current = autoSchedule;
    lockedNodeIdsRef.current = lockedNodeIds;
    isManagerRef.current = isManager;
  });

  // A row is locked only when its own WBS node (or an ancestor) is locked.
  // Tasks the planner adds straight into the Gantt sit under the flat "TASKS"
  // container, which is never a WBS descendant, so they stay editable.
  const taskLocked = useCallback((taskId: string): boolean => {
    const t = tasksRef.current.find((x) => x.id === taskId);
    return !!t?.wbs_node_id && lockedNodeIdsRef.current.has(t.wbs_node_id);
  }, []);
  const nodeLocked = useCallback(
    (nodeId: string): boolean => lockedNodeIdsRef.current.has(nodeId),
    [],
  );
  /**
   * Toasts + returns true when a non-manager tries to touch a locked backbone —
   * use as `if (guardLocked(...)) return;`. Admins / PMs are let through.
   */
  const guardLocked = useCallback((locked: boolean): boolean => {
    const block = locked && !isManagerRef.current;
    if (block) toast.error(LOCK_TOAST);
    return block;
  }, []);

  const lockedRowIds = useMemo(() => {
    const out = new Set<string>();
    for (const id of lockedNodeIds) out.add(`node:${id}`);
    for (const t of tasks) {
      if (t.wbs_node_id && lockedNodeIds.has(t.wbs_node_id)) out.add(`task:${t.id}`);
    }
    return out;
  }, [lockedNodeIds, tasks]);
  const lockedTaskIds = useMemo(() => {
    const out = new Set<string>();
    for (const t of tasks) {
      if (t.wbs_node_id && lockedNodeIds.has(t.wbs_node_id)) out.add(t.id);
    }
    return out;
  }, [lockedNodeIds, tasks]);

  const fetchAll = useCallback(async () => {
    const [tRes, nRes, pRes, calRes, maskRes, floatRes, pcrRes, pendingReviewRes] = await Promise.all([
      listWbsTasksByProjectIdOrderedBySortOrder(TASK_COLS, projectId, TASK_LIMIT),
      listWbsNodesByProjectIdOrderedBySortOrder(NODE_COLS, projectId, NODE_LIMIT),
      getProjectById(projectId, "id, project_code, project_name, progress_percentage, data_date, end_date"),
      getPlanCalendarByProjectId(projectId),
      getPlanWbsCodeMaskByProjectId(projectId),
      getPlanScheduleSettingByProjectId(projectId, "critical_float_threshold_days, near_critical_float_threshold_days, progress_line_date_source, progress_line_custom_date, progress_line_color, progress_line_point_shape, progress_line_point_color, progress_line_show_date, bar_style"),
      getWeeklyPlanByProjectIdWithStatusApproved(projectId),
      listWbsTaskProgressReviewsByProjectIdWithStatusPendingOfWbsTaskId(projectId),
    ]);
    if (tRes.error) toast.error(tRes.error.message);
    setWbsCodeMask(maskFromRow((maskRes.data as WbsMaskRow | null) ?? null));
    const settingsRow = floatRes.data as {
      critical_float_threshold_days: number;
      near_critical_float_threshold_days: number;
      progress_line_date_source: ProgressLineDateSource;
      progress_line_custom_date: string | null;
      progress_line_color: string;
      progress_line_point_shape: ProgressLinePointShape;
      progress_line_point_color: string;
      progress_line_show_date: boolean;
      bar_style: GanttBarStyleSettings | null;
    } | null;
    setFloatThresholds(
      settingsRow
        ? { critical: settingsRow.critical_float_threshold_days, nearCritical: settingsRow.near_critical_float_threshold_days }
        : DEFAULT_FLOAT_THRESHOLDS,
    );
    setProgressLineStyle(
      settingsRow
        ? {
            dateSource: settingsRow.progress_line_date_source,
            customDate: settingsRow.progress_line_custom_date,
            color: settingsRow.progress_line_color,
            pointShape: settingsRow.progress_line_point_shape,
            pointColor: settingsRow.progress_line_point_color,
            showDate: settingsRow.progress_line_show_date,
          }
        : DEFAULT_PROGRESS_LINE_STYLE,
    );
    setBarStyle(
      settingsRow?.bar_style
        ? {
            normal: { ...DEFAULT_BAR_STYLE.normal, ...settingsRow.bar_style.normal },
            critical: { ...DEFAULT_BAR_STYLE.critical, ...settingsRow.bar_style.critical },
            nearCritical: { ...DEFAULT_BAR_STYLE.nearCritical, ...settingsRow.bar_style.nearCritical },
            text: { ...DEFAULT_BAR_STYLE.text, ...settingsRow.bar_style.text },
          }
        : DEFAULT_BAR_STYLE,
    );
    setWeeklyPlanPcr((pcrRes.data as { pcr: number | null } | null)?.pcr ?? null);
    setPendingProgressReviewTaskIds(
      new Set(((pendingReviewRes.data ?? []) as { wbs_task_id: string }[]).map((r) => r.wbs_task_id)),
    );

    const calRow = (calRes.data ?? null) as PlanCalendarRow | null;
    let exceptions: PlanCalendarExceptionRow[] = [];
    if (calRow) {
      const exRes = await listPlanCalendarExceptionsByCalendarIdLimited(calRow.id, CALENDAR_EXCEPTION_LIMIT);
      exceptions = (exRes.data ?? []) as PlanCalendarExceptionRow[];
    } else if (warnedNoCalendar.current !== projectId) {
      warnedNoCalendar.current = projectId;
      toast.message("No work calendar for this project — scheduling on Mon–Fri", {
        description: "Set one up under Planning ▸ Calendars.",
      });
    }

    const proj = pRes.data as {
      id: string;
      project_code: string | null;
      project_name: string | null;
      progress_percentage: number | null;
      data_date: string | null;
      end_date: string | null;
    } | null;

    const freshTasks = (tRes.data ?? []) as unknown as SheetTask[];
    const freshNodes = (nRes.data ?? []) as unknown as SheetNode[];
    const freshCalendar = buildWorkCalendar(calRow, exceptions);

    // Mirror the just-fetched data into the async-callback refs *now*, before
    // React has re-rendered. Without this, an operation that reloads and then
    // immediately runs the scheduler (e.g. Move Project → reload →
    // runAutoSchedule) would recompute from the pre-reload snapshot and paint
    // stale dates until a manual page refresh.
    tasksRef.current = freshTasks;
    nodesRef.current = freshNodes;
    calendarRef.current = freshCalendar;

    setTasks(freshTasks);
    setNodes(freshNodes);
    setContainerId(findContainer(freshNodes));
    setDataDate(proj?.data_date ?? null);
    setProject(
      proj
        ? {
            id: proj.id,
            project_code: proj.project_code ?? "PROJ",
            project_name: proj.project_name ?? "Project",
            progress_percentage: proj.progress_percentage ?? 0,
            end_date: proj.end_date ?? null,
          }
        : null,
    );
    setCalendar(freshCalendar);
  }, [supabase, projectId]);

  useEffect(() => {
    let cancelled = false;
    if (!projectId || !enabled) {
      /* eslint-disable react-hooks/set-state-in-effect */
      if (!projectId) {
        setTasks([]);
        setNodes([]);
        setProject(null);
        setContainerId(null);
        setCalendar(DEFAULT_CALENDAR);
      }
      setLoading(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    setLoading(true);
    fetchAll().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, fetchAll, enabled]);

  const reload = useCallback(async () => {
    await fetchAll();
  }, [fetchAll]);

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------
  const readOnly = !!overrideDates;

  /**
   * Live tasks, or — when a saved revision is being *viewed* — the same tasks
   * with their dates swapped for the revision's. Everything that renders (tree,
   * rollups, float, timeline, grid) reads this; the write path keeps using the
   * raw `tasks` / `tasksRef`, and is disabled anyway while `overrideDates` is on.
   */
  const viewTasks = useMemo(() => {
    if (!overrideDates) return tasks;
    return tasks.map((t) => {
      const d = overrideDates.get(t.id);
      if (!d || (!d.start && !d.end)) return t;
      return { ...t, start_date: d.start ?? t.start_date, end_date: d.end ?? t.end_date };
    });
  }, [tasks, overrideDates]);

  const tree = useMemo(
    () => buildSheetTree(nodes, viewTasks, containerId, project),
    [nodes, viewTasks, containerId, project],
  );
  const flatRows = useMemo(() => flattenRows(tree), [tree]);
  const nextCodePreview = useMemo(() => nextTaskCode(tasks), [tasks]);
  const taskById = useMemo(() => new Map(viewTasks.map((t) => [t.id, t])), [viewTasks]);

  /**
   * MS-Project WBS code per row: the persisted `wbs_outline_code` override when
   * set, else computed live from the row's outline position (1-based sibling
   * index at every ancestor level) + the project's code mask. The synthetic
   * project row shows just the prefix.
   */
  const wbsCodeByRowId = useMemo(() => {
    const out = new Map<string, string>();
    const walk = (rows: SheetRow[], path: number[]) => {
      rows.forEach((r, i) => {
        const isProjectRow =
          r.kind === "node" && r.node.node_type === PROJECT_NODE_TYPE;
        const here = isProjectRow ? [] : [...path, i + 1];
        const override =
          r.kind === "task" ? r.task.wbs_outline_code : r.node.wbs_outline_code ?? null;
        const computed = computeWbsCode(here, wbsCodeMask);
        // The project row's mask has no numeric segment of its own (`here` is
        // always []); fall back to "0" rather than leaving it blank when no
        // code prefix is configured — mirrors MS Project's project-summary WBS.
        out.set(r.id, override || (isProjectRow && !computed ? "0" : computed));
        if (r.children.length) walk(r.children, here);
      });
    };
    walk(tree, []);
    return out;
  }, [tree, wbsCodeMask]);

  /**
   * One numbering pass drives both the `#` column and the Predecessors cell.
   * The synthetic project row gets number 0 (like MS Project's project summary)
   * and is not addressable as a predecessor; every other row counts up from 1.
   */
  const { rowNumberById, predecessorMaps } = useMemo(() => {
    const numById = new Map<string, number>();
    const byRow = new Map<number, string>();
    const byCode = new Map<string, string>();
    const rowByTask = new Map<string, number>();
    let n = 0;
    for (const r of flatRows) {
      if (r.kind === "node" && r.node.node_type === PROJECT_NODE_TYPE) {
        numById.set(r.id, 0);
        continue;
      }
      n += 1;
      numById.set(r.id, n);
      if (r.kind === "task") {
        byRow.set(n, r.task.id);
        byCode.set(r.task.task_code.toUpperCase(), r.task.id);
        rowByTask.set(r.task.id, n);
      }
    }
    return { rowNumberById: numById, predecessorMaps: { byRow, byCode, rowByTask } };
  }, [flatRows]);

  /** CPM analysis over the current task set — drives float / critical colouring. */
  const analysis = useMemo(() => {
    if (viewTasks.length === 0) {
      return {
        float: new Map<string, TaskFloat>(),
        dates: new Map<string, { start: string; finish: string }>(),
        violations: new Map<string, string>(),
        error: null as string | null,
      };
    }
    const result = scheduleProject(
      toEngineTasks(viewTasks, calendar),
      calendar,
      dataDate ?? todayISO(),
      floatThresholds,
    );
    if (!result.ok) {
      const names = result.cycle
        .map((id) => viewTasks.find((t) => t.id === id)?.task_code ?? id.slice(0, 8))
        .join(" → ");
      return {
        float: new Map<string, TaskFloat>(),
        dates: new Map<string, { start: string; finish: string }>(),
        violations: new Map<string, string>(),
        error: `Circular dependency: ${names}`,
      };
    }
    return { float: result.float, dates: result.dates, violations: result.violations, error: null };
  }, [viewTasks, calendar, dataDate, floatThresholds]);

  /** Dashboard/toolbar headline numbers (Planning Completion Plan 1.4 / 1.5). */
  const kpis = useMemo(
    () =>
      computeScheduleKpis(
        viewTasks,
        analysis.float,
        analysis.dates,
        calendar,
        dataDate ?? todayISO(),
        project?.end_date ?? null,
        weeklyPlanPcr,
      ),
    [viewTasks, analysis.float, analysis.dates, calendar, dataDate, project?.end_date, weeklyPlanPcr],
  );

  // -------------------------------------------------------------------------
  // Container node
  // -------------------------------------------------------------------------
  const ensureContainer = useCallback(async (): Promise<string> => {
    if (containerId) return containerId;
    const existing = findContainer(nodesRef.current);
    if (existing) {
      setContainerId(existing);
      return existing;
    }
    if (containerPromise.current) return containerPromise.current;
    containerPromise.current = (async () => {
      const found = await getWbsNodeByProjectIdWithParentIdAndNodeTypeTaskGroupAndWbsCodeTASKS(NODE_COLS, projectId);
      if (found.data) {
        const rec = found.data as unknown as SheetNode;
        setNodes((p) => (p.some((n) => n.id === rec.id) ? p : [...p, rec]));
        setContainerId(rec.id);
        return rec.id;
      }
      const maxRootSort = Math.max(
        0,
        ...nodesRef.current.filter((n) => !n.parent_id).map((n) => n.sort_order ?? 0),
      );
      const ins = await insertWbsNodeReturning({
          project_id: projectId,
          parent_id: null,
          node_type: "task_group",
          wbs_code: "TASKS",
          wbs_name: "Tasks",
          sort_order: maxRootSort + 10,
        }, NODE_COLS);
      if (ins.error || !ins.data) {
        const retry = await getWbsNodeByProjectIdWithParentIdAndWbsCodeTASKS(projectId);
        if (retry.data?.id) {
          setContainerId(retry.data.id);
          return retry.data.id;
        }
        throw ins.error ?? new Error("Failed to create container node");
      }
      const rec = ins.data as unknown as SheetNode;
      setNodes((p) => [...p, rec]);
      setContainerId(rec.id);
      return rec.id;
    })();
    try {
      return await containerPromise.current;
    } catch (e) {
      containerPromise.current = null;
      throw e;
    }
  }, [containerId, projectId, supabase]);

  // -------------------------------------------------------------------------
  // The single write path for anything that can move a date
  // -------------------------------------------------------------------------
  /**
   * Applies `patches` optimistically, runs the scheduling engine over the
   * result, persists the direct patches plus every rippled date in one
   * `apply_schedule_dates` call, and rolls the whole thing back on failure.
   */
  const applySchedule = useCallback(
    async (
      patches: Array<{ id: string; patch: Partial<SheetTask> }>,
      opts: { note?: string; silent?: boolean; force?: boolean } = {},
    ) => {
      const snapshot = tasksRef.current;
      const patchById = new Map(patches.map((p) => [p.id, p.patch]));
      let next = snapshot.map((t) =>
        patchById.has(t.id) ? { ...t, ...patchById.get(t.id) } : t,
      );

      const cal = calendarRef.current;
      const rippled: Array<{ id: string; start_date: string; end_date: string }> = [];
      const engineRan = (opts.force || autoScheduleRef.current) && next.length > 0;

      if (engineRan) {
        const result = scheduleProject(
          toEngineTasks(next, cal),
          cal,
          dataDate ?? todayISO(),
        );
        if (!result.ok) {
          const names = result.cycle
            .map((id) => next.find((t) => t.id === id)?.task_code ?? id.slice(0, 8))
            .join(" → ");
          toast.error(`That would create a circular dependency (${names})`);
          return;
        }
        // A locked task feeds the engine as a fixed input but its own dates are
        // never written — filter it out of the ripple entirely.
        const locked = lockedNodeIdsRef.current;
        const nodeByTask = new Map(next.map((t) => [t.id, t.wbs_node_id]));
        for (const t of next) {
          const d = result.dates.get(t.id);
          if (!d) continue;
          const nid = nodeByTask.get(t.id);
          if (nid && locked.has(nid)) continue;
          if (d.start !== t.start_date || d.finish !== t.end_date) {
            rippled.push({ id: t.id, start_date: d.start, end_date: d.finish });
          }
        }
        const rippleById = new Map(rippled.map((r) => [r.id, r]));
        next = next.map((t) => {
          const r = rippleById.get(t.id);
          return r ? { ...t, start_date: r.start_date, end_date: r.end_date } : t;
        });
      }
      // Auto-schedule off ⇒ `rippled` stays empty and only the direct patches write.

      setTasks(next);

      // 1. Direct field patches (names, deps, flags, explicit dates).
      for (const { id, patch } of patches) {
        const { error } = await updateWbsTaskById(patch, id);
        if (error) {
          setTasks(snapshot);
          toast.error("Failed to save: " + error.message);
          return;
        }
      }

      // 2. The reschedule ripple, in one round-trip.
      const ripplePayload = rippled.filter((r) => !patchById.has(r.id));
      if (ripplePayload.length > 0) {
        const { error } = await applyScheduleDates({
          p_project_id: projectId,
          p_rows: ripplePayload,
        });
        if (error) {
          setTasks(snapshot);
          toast.error("Failed to reschedule: " + error.message);
          return;
        }
      }

      // Audit trail (Completion Plan 1.1) — one row per changed field on a
      // directly-patched task, plus one "ripple" row per task the CPM engine
      // rescheduled as a side effect. Fire-and-forget: never blocks the UI on
      // a logging failure (logScheduleAudit already swallows its own errors).
      const auditBase = { projectId, userId: currentUserIdRef.current };
      const before = new Map(snapshot.map((t) => [t.id, t]));
      for (const { id, patch } of patches) {
        const b = before.get(id);
        if (!b) continue;
        const changes: { action: ScheduleAuditAction; fieldName: string; oldValue: string | null; newValue: string | null }[] = [];
        if ("start_date" in patch) changes.push({ action: "Plan Start Changed", fieldName: "start_date", oldValue: b.start_date, newValue: patch.start_date ?? null });
        if ("end_date" in patch) changes.push({ action: "Plan Finish Changed", fieldName: "end_date", oldValue: b.end_date, newValue: patch.end_date ?? null });
        if ("dependency_task_ids" in patch) {
          changes.push({
            action: "Dependency Changed",
            fieldName: "dependency_task_ids",
            oldValue: JSON.stringify(b.dependency_task_ids ?? []),
            newValue: JSON.stringify(patch.dependency_task_ids ?? []),
          });
        }
        if ("constraint_type" in patch || "constraint_date" in patch) {
          changes.push({
            action: "Constraint Changed",
            fieldName: "constraint_type",
            oldValue: b.constraint_type ? `${b.constraint_type} ${b.constraint_date ?? ""}`.trim() : null,
            newValue: patch.constraint_type ? `${patch.constraint_type} ${patch.constraint_date ?? b.constraint_date ?? ""}`.trim() : null,
          });
        }
        if (changes.length > 0) void logScheduleFieldChanges(supabase, { ...auditBase, taskId: id, nodeId: b.wbs_node_id }, changes);
      }
      for (const r of ripplePayload) {
        const b = before.get(r.id);
        if (!b) continue;
        void logScheduleAudit(supabase, {
          ...auditBase,
          taskId: r.id,
          nodeId: b.wbs_node_id,
          action: "Task Rescheduled",
          fieldName: "ripple",
          oldValue: JSON.stringify({ start: b.start_date, end: b.end_date }),
          newValue: JSON.stringify({ start: r.start_date, end: r.end_date }),
        });
      }

      // MS-Project calculation state: a schedule edit with auto-schedule OFF
      // leaves the plan "needs Calculate"; running the engine clears it.
      if (engineRan) setCalcNeeded(false);
      else if (patches.length > 0) setCalcNeeded(true);

      if (opts.note) toast.message(opts.note);
      if (!opts.silent && ripplePayload.length > 0) {
        toast.message(
          `${ripplePayload.length} task${ripplePayload.length === 1 ? "" : "s"} rescheduled`,
        );
      }

      // Schedule alerts (Completion Plan 1.6) — debounced so a burst of edits
      // (e.g. dragging several bars) triggers one server-side evaluation, not
      // one per edit. Fire-and-forget: never blocks the UI on the network call.
      if (engineRan) {
        if (alertEvalTimer.current) clearTimeout(alertEvalTimer.current);
        alertEvalTimer.current = setTimeout(() => {
          fetch(`/api/planning/alerts/${projectId}/evaluate`, { method: "POST" }).catch(() => {});
        }, 2000);
      }
    },
    [dataDate, projectId, supabase],
  );

  /** Rewrites all three dependency arrays together so they can never drift. */
  const writeDeps = useCallback(
    async (taskId: string, deps: EngineDep[], note?: string) => {
      await applySchedule([{ id: taskId, patch: depsToArrays(deps) }], { note });
    },
    [applySchedule],
  );

  // -------------------------------------------------------------------------
  // Task writes
  // -------------------------------------------------------------------------
  const createTask = useCallback(
    async (name: string, afterRowId: string | null) => {
      const trimmed = name.trim();
      if (!trimmed) return;

      let nodeId: string | null = null;
      if (afterRowId?.startsWith("task:")) {
        nodeId = tasksRef.current.find((t) => t.id === afterRowId.slice(5))?.wbs_node_id ?? null;
      } else if (afterRowId?.startsWith("node:")) {
        const raw = afterRowId.slice(5);
        nodeId = raw.startsWith("project:") ? null : raw;
      }
      if (nodeId && guardLocked(nodeLocked(nodeId))) return;
      if (!nodeId) {
        try {
          nodeId = await ensureContainer();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not create a container row");
          return;
        }
      }
      if (nodeId && guardLocked(nodeLocked(nodeId))) return;

      const start = nextWorkingDay(calendarRef.current, dataDate ?? todayISO(), 1);
      let attempt = 0;
      let code = nextTaskCode(tasksRef.current);
      while (attempt < 5) {
        attempt++;
        const so = nextSort();
        const payload = {
          project_id: projectId,
          wbs_node_id: nodeId,
          task_code: code,
          task_name: trimmed,
          start_date: start,
          end_date: start,
          progress: 0,
          status: "open",
          sort_order: so,
          is_milestone: false,
          manually_scheduled: false,
        };
        const res = await insertWbsTasksReturning(payload, TASK_COLS);
        if (!res.error && res.data) {
          const created = res.data as unknown as SheetTask;
          setTasks((p) => [...p, created]);
          void logScheduleAudit(supabase, {
            projectId,
            taskId: created.id,
            nodeId,
            userId: currentUserIdRef.current,
            action: "Task Created",
            fieldName: "task_name",
            oldValue: null,
            newValue: trimmed,
          });
          return;
        }
        if (res.error && isDuplicateTaskCodeError(res.error.message)) {
          const codesRes = await listWbsTasksByProjectIdOfTaskCode(projectId);
          code = nextTaskCode((codesRes.data ?? []) as Pick<SheetTask, "task_code">[]);
          continue;
        }
        toast.error("Failed to add task: " + res.error?.message);
        return;
      }
      toast.error("Could not allocate a unique task code");
    },
    [dataDate, ensureContainer, guardLocked, nextSort, nodeLocked, projectId, supabase],
  );

  const setPredecessors = useCallback(
    async (taskId: string, raw: string) => {
      const task = tasksRef.current.find((t) => t.id === taskId);
      if (!task) return;
      if (guardLocked(taskLocked(taskId))) return;
      const { deps, errors } = parsePredecessors(
        raw,
        predecessorMaps.byRow,
        predecessorMaps.byCode,
        taskId,
      );
      if (errors.length) {
        toast.error(errors[0]);
        return;
      }
      const current = depsFromArrays(
        task.dependency_task_ids,
        task.dependency_types,
        task.dependency_lag_days,
      );
      const same =
        current.length === deps.length &&
        current.every(
          (c, i) => c.predId === deps[i].predId && c.type === deps[i].type && c.lag === deps[i].lag,
        );
      if (same) return;
      await writeDeps(taskId, deps);
    },
    [guardLocked, predecessorMaps, taskLocked, writeDeps],
  );

  const updateTaskField = useCallback(
    async (taskId: string, field: SheetField, raw: string) => {
      const task = tasksRef.current.find((t) => t.id === taskId);
      if (!task) return;
      if (guardLocked(taskLocked(taskId))) return;
      const cal = calendarRef.current;

      if (field === "predecessors") {
        await setPredecessors(taskId, raw);
        return;
      }

      let patch: Partial<SheetTask> = {};
      let note: string | null = null;
      let schedules = false;

      switch (field) {
        case "name": {
          const v = raw.trim();
          if (!v || v === task.task_name) return;
          patch = { task_name: v };
          break;
        }
        case "code": {
          const v = raw.trim();
          if (!v || v === task.task_code) return;
          if (
            tasksRef.current.some(
              (t) => t.id !== taskId && t.task_code.toLowerCase() === v.toLowerCase(),
            )
          ) {
            toast.error(`Code "${v}" is already used in this project`);
            return;
          }
          patch = { task_code: v };
          break;
        }
        case "start": {
          if (!isValidISO(raw)) return;
          schedules = true;
          const hasPredecessors = (task.dependency_task_ids?.length ?? 0) > 0;
          if (hasPredecessors && !task.manually_scheduled) {
            // MS Project behaviour: typing a date on a linked, auto-scheduled
            // task sets a Start-No-Earlier-Than constraint, it does not pin it.
            patch = { constraint_type: "start_no_earlier_than", constraint_date: raw };
            note = `Constraint set: start no earlier than ${raw}`;
          } else {
            patch = recalcOnStart(task, raw, cal);
          }
          break;
        }
        case "finish": {
          if (!isValidISO(raw)) return;
          schedules = true;
          const r = recalcOnFinish(task, raw, cal);
          patch = r.patch;
          if (r.clamped) note = "Finish can't precede start — clamped to start";
          break;
        }
        case "duration": {
          const r = recalcOnDuration(task, raw, dataDate ?? todayISO(), cal);
          if (!r) {
            toast.error("Duration must be a whole number of working days (0 = milestone)");
            return;
          }
          schedules = true;
          patch = r.patch;
          if (r.seededStart) note = `Start set to ${r.seededStart}`;
          break;
        }
        case "progress": {
          const n = Math.round(Number(raw));
          if (!Number.isFinite(n) || n < 0 || n > 100) {
            toast.error("% Complete must be between 0 and 100");
            return;
          }
          if (n === task.progress) return;
          patch = { progress: n };
          break;
        }
        case "status": {
          if (raw === task.status) return;
          patch = { status: raw };
          break;
        }
        case "priority": {
          if (raw === task.priority) return;
          patch = { priority: raw };
          break;
        }
        default:
          return;
      }

      if (schedules) {
        await applySchedule([{ id: taskId, patch }], { note: note ?? undefined });
        return;
      }

      // Non-scheduling fields: plain optimistic update + rollback.
      const snapshot = task;
      setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
      const { error } = await updateWbsTaskById(patch, taskId);
      if (error) {
        setTasks((p) => p.map((t) => (t.id === taskId ? snapshot : t)));
        toast.error("Failed to save: " + error.message);
        return;
      }
      if (field === "progress") {
        void logScheduleAudit(supabase, {
          projectId,
          taskId,
          nodeId: task.wbs_node_id,
          userId: currentUserIdRef.current,
          action: "Progress Updated",
          fieldName: "progress",
          oldValue: String(snapshot.progress),
          newValue: String(patch.progress ?? snapshot.progress),
        });
      }
      if (note) toast.message(note);
      if (field === "progress") reload();
    },
    [applySchedule, dataDate, guardLocked, projectId, reload, setPredecessors, supabase, taskLocked],
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      if (guardLocked(taskLocked(taskId))) return;
      // Captured before the delete — wbs_audit_log.wbs_task_id has ON DELETE
      // CASCADE, so a row inserted *after* the delete with this taskId would
      // simply fail its FK check (the parent no longer exists). Log with
      // taskId: null and the identifying text in old_value instead.
      const deleted = tasksRef.current.find((t) => t.id === taskId) ?? null;
      const res = await deleteWbsTaskByIdReturning(taskId);
      if (res.error) {
        toast.error(res.error.message);
        return;
      }
      if (!res.data) {
        toast.error("You don't have permission to delete tasks");
        return;
      }
      if (deleted) {
        void logScheduleAudit(supabase, {
          projectId,
          taskId: null,
          nodeId: deleted.wbs_node_id,
          userId: currentUserIdRef.current,
          action: "Task Deleted",
          fieldName: "task_name",
          oldValue: `${deleted.task_code} ${deleted.task_name}`,
          newValue: null,
        });
      }
      // Drop the deleted task from every successor's dependency arrays.
      const orphaned = tasksRef.current.filter((t) =>
        (t.dependency_task_ids ?? []).includes(taskId),
      );
      setTasks((p) =>
        p
          .filter((t) => t.id !== taskId)
          .map((t) => {
            if (!(t.dependency_task_ids ?? []).includes(taskId)) return t;
            const deps = depsFromArrays(
              t.dependency_task_ids,
              t.dependency_types,
              t.dependency_lag_days,
            ).filter((d) => d.predId !== taskId);
            return { ...t, ...depsToArrays(deps) };
          }),
      );
      for (const t of orphaned) {
        const deps = depsFromArrays(
          t.dependency_task_ids,
          t.dependency_types,
          t.dependency_lag_days,
        ).filter((d) => d.predId !== taskId);
        await updateWbsTaskById(depsToArrays(deps), t.id);
      }
      toast.success("Task deleted");
    },
    [guardLocked, projectId, supabase, taskLocked],
  );

  // -------------------------------------------------------------------------
  // Links
  // -------------------------------------------------------------------------
  const linkTasks = useCallback(
    async (predId: string, succId: string, type: DepType = "fs", lag = 0) => {
      if (predId === succId) return;
      const succ = tasksRef.current.find((t) => t.id === succId);
      if (!succ) return;
      if (guardLocked(taskLocked(succId))) return;
      const deps = depsFromArrays(
        succ.dependency_task_ids,
        succ.dependency_types,
        succ.dependency_lag_days,
      );
      if (deps.some((d) => d.predId === predId)) {
        toast.error("Those tasks are already linked");
        return;
      }
      const depsByTask = new Map(
        tasksRef.current.map((t) => [
          t.id,
          depsFromArrays(t.dependency_task_ids, t.dependency_types, t.dependency_lag_days),
        ]),
      );
      if (wouldCycle(predId, succId, depsByTask)) {
        toast.error("That link would create a circular dependency");
        return;
      }
      await writeDeps(succId, [...deps, { predId, type, lag }], "Dependency added");
    },
    [guardLocked, taskLocked, writeDeps],
  );

  const updateLink = useCallback(
    async (succId: string, index: number, type: DepType, lag: number) => {
      const succ = tasksRef.current.find((t) => t.id === succId);
      if (!succ) return;
      if (guardLocked(taskLocked(succId))) return;
      const deps = depsFromArrays(
        succ.dependency_task_ids,
        succ.dependency_types,
        succ.dependency_lag_days,
      );
      if (!deps[index]) return;
      deps[index] = { ...deps[index], type, lag };
      await writeDeps(succId, deps, "Relation updated");
    },
    [guardLocked, taskLocked, writeDeps],
  );

  const removeLink = useCallback(
    async (succId: string, index: number) => {
      const succ = tasksRef.current.find((t) => t.id === succId);
      if (!succ) return;
      if (guardLocked(taskLocked(succId))) return;
      const deps = depsFromArrays(
        succ.dependency_task_ids,
        succ.dependency_types,
        succ.dependency_lag_days,
      );
      if (!deps[index]) return;
      deps.splice(index, 1);
      await writeDeps(succId, deps, "Link removed");
    },
    [guardLocked, taskLocked, writeDeps],
  );

  // -------------------------------------------------------------------------
  // Scheduling toggles
  // -------------------------------------------------------------------------
  const rescheduleTask = useCallback(
    async (taskId: string, start: string, finish: string) => {
      const task = tasksRef.current.find((t) => t.id === taskId);
      if (!task) return;
      if (guardLocked(taskLocked(taskId))) return;
      const patch: Partial<SheetTask> = { start_date: start, end_date: finish };
      // Dragging a linked, auto-scheduled bar pins it with a constraint rather
      // than letting the engine snap it straight back.
      if ((task.dependency_task_ids?.length ?? 0) > 0 && !task.manually_scheduled) {
        patch.constraint_type = "start_no_earlier_than";
        patch.constraint_date = start;
      }
      await applySchedule([{ id: taskId, patch }]);
    },
    [applySchedule, guardLocked, taskLocked],
  );

  // % complete via mouse-wheel over a bar — instant optimistic paint, one
  // trailing DB write per task after the wheel settles (no reload).
  const progressTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(
    () => () => {
      for (const t of progressTimers.current.values()) clearTimeout(t);
      progressTimers.current.clear();
    },
    [],
  );
  const setProgress = useCallback(
    (taskId: string, pct: number) => {
      const n = Math.max(0, Math.min(100, Math.round(pct)));
      const task = tasksRef.current.find((t) => t.id === taskId);
      if (!task || task.progress === n) return;
      if (guardLocked(taskLocked(taskId))) return;
      const previous = task.progress;
      setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, progress: n } : t)));
      const pending = progressTimers.current.get(taskId);
      if (pending) clearTimeout(pending);
      progressTimers.current.set(
        taskId,
        setTimeout(async () => {
          progressTimers.current.delete(taskId);
          // Completion Plan 2.2 — submit_progress() writes directly when the
          // project has no review flow enabled (the common case); otherwise it
          // parks the change as a pending wbs_task_progress_reviews row and we
          // must roll the optimistic update back until a planner decides it.
          const { data, error } = await submitProgress({ p_task_id: taskId, p_progress: n });
          if (error) {
            toast.error("Failed to save % complete: " + error.message);
            reload();
            return;
          }
          const mode = (data as { mode?: string } | null)?.mode;
          if (mode === "pending") {
            setTasks((p) => p.map((t) => (t.id === taskId ? { ...t, progress: previous } : t)));
            setPendingProgressReviewTaskIds((prev) => new Set(prev).add(taskId));
            toast.message(`"${task.task_name}" progress change (${n}%) submitted for review`);
          }
        }, 450),
      );
    },
    [guardLocked, reload, supabase, taskLocked],
  );

  const toggleMilestone = useCallback(
    async (taskId: string) => {
      const task = tasksRef.current.find((t) => t.id === taskId);
      if (!task) return;
      if (guardLocked(taskLocked(taskId))) return;
      const next = !task.is_milestone;
      const patch: Partial<SheetTask> = { is_milestone: next };
      if (next && task.start_date) patch.end_date = task.start_date;
      await applySchedule([{ id: taskId, patch }], {
        note: next ? "Converted to a milestone" : "Converted to a task",
      });
    },
    [applySchedule, guardLocked, taskLocked],
  );

  const toggleManualSchedule = useCallback(
    async (taskId: string) => {
      const task = tasksRef.current.find((t) => t.id === taskId);
      if (!task) return;
      if (guardLocked(taskLocked(taskId))) return;
      const next = !task.manually_scheduled;
      const patch: Partial<SheetTask> = { manually_scheduled: next };
      // Going back to auto clears any constraint the pin was standing in for.
      if (!next && task.constraint_type === "start_no_earlier_than") {
        patch.constraint_type = null;
        patch.constraint_date = null;
      }
      await applySchedule([{ id: taskId, patch }], {
        note: next ? "Pinned — the scheduler won't move it" : "Auto-scheduled",
      });
    },
    [applySchedule, guardLocked, taskLocked],
  );

  const setConstraint = useCallback(
    async (taskId: string, type: string | null, date: string | null) => {
      const task = tasksRef.current.find((t) => t.id === taskId);
      if (!task) return;
      if (guardLocked(taskLocked(taskId))) return;
      const cleared = !type || type === "as_soon_as_possible";
      const needsDate = !cleared && type !== "as_late_as_possible";
      const patch: Partial<SheetTask> = {
        constraint_type: cleared ? null : type,
        constraint_date: needsDate
          ? date ?? task.constraint_date ?? task.start_date
          : null,
      };
      if (
        patch.constraint_type === task.constraint_type &&
        patch.constraint_date === task.constraint_date
      ) {
        return;
      }
      await applySchedule([{ id: taskId, patch }], { note: "Constraint updated" });
    },
    [applySchedule, guardLocked, taskLocked],
  );

  const assignOwner = useCallback(
    async (taskId: string, profile: { id: string; full_name: string | null }) => {
      const task = tasksRef.current.find((t) => t.id === taskId);
      if (!task) return;
      if (guardLocked(taskLocked(taskId))) return;
      try {
        const resource = await findOrCreateResourceForProfile(
          projectId,
          profile.id,
          profile.full_name ?? "Unnamed",
        );
        await addAssignment(taskId, resource.id, 100);
        toast.success(`${profile.full_name ?? "Team member"} assigned`);
        await reload();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    },
    [guardLocked, projectId, reload, taskLocked],
  );

  const runAutoSchedule = useCallback(async () => {
    if (tasksRef.current.length === 0) return;
    await applySchedule([], { force: true, note: "Schedule is up to date" });
  }, [applySchedule]);

  // -------------------------------------------------------------------------
  // WBS codes (MS-Project WBS Code Definition)
  // -------------------------------------------------------------------------
  const renumberWbsCodes = useCallback(async (mask?: WbsCodeMask) => {
    const m = mask ?? wbsCodeMask;
    const rows: { id: string; kind: "node" | "task"; code: string }[] = [];
    const walk = (list: SheetRow[], path: number[]) => {
      list.forEach((r, i) => {
        const isProjectRow = r.kind === "node" && r.node.node_type === PROJECT_NODE_TYPE;
        const here = isProjectRow ? [] : [...path, i + 1];
        if (!isProjectRow) {
          rows.push({
            id: r.kind === "task" ? r.task.id : r.node.id,
            kind: r.kind === "task" ? "task" : "node",
            code: computeWbsCode(here, m),
          });
        }
        if (r.children.length) walk(r.children, here);
      });
    };
    walk(tree, []);
    if (rows.length === 0) return;
    const { error } = await applyWbsCodes({
      p_project_id: projectId,
      p_rows: rows,
    });
    if (error) {
      toast.error("Failed to renumber WBS codes: " + error.message);
      return;
    }
    await reload();
    toast.message(`WBS codes renumbered (${rows.length} rows)`);
  }, [tree, wbsCodeMask, projectId, supabase, reload]);

  const setWbsCode = useCallback(
    async (rowId: string, raw: string) => {
      const isTask = rowId.startsWith("task:");
      const id = rowId.replace(/^(task|node):/, "");
      if (!isTask && rowId.startsWith("node:project:")) return;
      if (guardLocked(isTask ? taskLocked(id) : nodeLocked(id))) return;
      const value = raw.trim() || null;

      if (value && wbsCodeMask.verifyUnique) {
        const clash = [...wbsCodeByRowId.entries()].some(
          ([rid, code]) => rid !== rowId && code.toLowerCase() === value.toLowerCase(),
        );
        if (clash) {
          toast.error(`WBS code "${value}" is already used`);
          return;
        }
      }

      if (isTask) {
        setTasks((p) => p.map((t) => (t.id === id ? { ...t, wbs_outline_code: value } : t)));
        const { error } = await updateWbsTaskById({ wbs_outline_code: value }, id);
        if (error) {
          toast.error("Failed to save WBS code: " + error.message);
          void reload();
        }
      } else {
        setNodes((p) => p.map((n) => (n.id === id ? { ...n, wbs_outline_code: value } : n)));
        const { error } = await updateWbsNodeById({ wbs_outline_code: value }, id);
        if (error) {
          toast.error("Failed to save WBS code: " + error.message);
          void reload();
        }
      }
    },
    [wbsCodeMask, wbsCodeByRowId, guardLocked, taskLocked, nodeLocked, supabase, reload],
  );

  // -------------------------------------------------------------------------
  // Node writes
  // -------------------------------------------------------------------------
  const createNode = useCallback(
    async (name: string, parentNodeIdRaw: string | null) => {
      // The synthetic project row is not a real parent — a summary added "under"
      // it is just a new root.
      const parentNodeId =
        parentNodeIdRaw && parentNodeIdRaw.startsWith("project:") ? null : parentNodeIdRaw;
      if (parentNodeId && guardLocked(nodeLocked(parentNodeId))) return;
      const siblingCodes = new Set(
        nodesRef.current
          .filter((n) => (n.parent_id ?? null) === (parentNodeId ?? null))
          .map((n) => n.wbs_code),
      );
      const code = uniqueSiblingCode("G" + (siblingCodes.size + 1), siblingCodes);
      const res = await insertWbsNodeReturning({
          project_id: projectId,
          parent_id: parentNodeId,
          node_type: "task_group",
          wbs_code: code,
          wbs_name: name.trim() || "New group",
          sort_order: nextSort(),
        }, NODE_COLS);
      if (res.error || !res.data) {
        toast.error(res.error?.message ?? "Failed to add summary row");
        return;
      }
      setNodes((p) => [...p, res.data as unknown as SheetNode]);
      toast.success("Summary row added");
    },
    [guardLocked, nextSort, nodeLocked, projectId, supabase],
  );

  const renameNode = useCallback(
    async (nodeId: string, name: string) => {
      if (nodeId.startsWith("project:")) return; // the project row is read-only here
      if (guardLocked(nodeLocked(nodeId))) return;
      const v = name.trim();
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node || !v || v === node.wbs_name) return;
      setNodes((p) => p.map((n) => (n.id === nodeId ? { ...n, wbs_name: v } : n)));
      const { error } = await updateWbsNodeById({ wbs_name: v }, nodeId);
      if (error) {
        setNodes((p) => p.map((n) => (n.id === nodeId ? node : n)));
        toast.error("Failed to rename: " + error.message);
      }
    },
    [guardLocked, nodeLocked, supabase],
  );

  const deleteNode = useCallback(
    async (nodeId: string) => {
      if (nodeId.startsWith("project:")) return; // can't delete the project row
      if (guardLocked(nodeLocked(nodeId))) return;
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;
      const descIds = getDescendantNodeIds(nodesRef.current, nodeId);
      const subtree = new Set([nodeId, ...descIds]);
      const taskCount = tasksRef.current.filter((t) => subtree.has(t.wbs_node_id)).length;
      const parts = [`Delete "${node.wbs_name}"`];
      if (descIds.length) parts.push(`its ${descIds.length} sub-group${descIds.length > 1 ? "s" : ""}`);
      if (taskCount) parts.push(`${taskCount} task${taskCount > 1 ? "s" : ""}`);
      if (!confirm(parts.join(", ").replace(/,([^,]*)$/, " and$1") + "? This cannot be undone.")) return;

      const res = await deleteWbsNodeByIdReturning(nodeId);
      if (res.error) {
        toast.error(res.error.message);
        return;
      }
      if (!res.data) {
        toast.error("You don't have permission to delete WBS nodes");
        return;
      }
      setNodes((p) => p.filter((n) => !subtree.has(n.id)));
      setTasks((p) => p.filter((t) => !subtree.has(t.wbs_node_id)));
      if (containerId && subtree.has(containerId)) setContainerId(null);
      toast.success("Deleted");
    },
    [containerId, guardLocked, nodeLocked, supabase],
  );

  // -------------------------------------------------------------------------
  // Hierarchy moves
  // -------------------------------------------------------------------------
  const moveTaskToNode = useCallback(
    async (taskId: string, nodeId: string) => {
      const task = tasksRef.current.find((t) => t.id === taskId);
      if (!task || task.wbs_node_id === nodeId) return;
      if (guardLocked(taskLocked(taskId) || nodeLocked(nodeId))) return;
      const so = nextSort();
      setTasks((p) =>
        p.map((t) => (t.id === taskId ? { ...t, wbs_node_id: nodeId, sort_order: so } : t)),
      );
      const { error } = await updateWbsTaskById({ wbs_node_id: nodeId, sort_order: so }, taskId);
      if (error) {
        setTasks((p) => p.map((t) => (t.id === taskId ? task : t)));
        toast.error("Failed to move task: " + error.message);
        return;
      }
      // Reparenting changes which WBS node each task's progress rolls up
      // into — reload so both the old and new parent's progress_percent
      // (recalculated server-side by the wbs_node_id trigger) show up.
      await reload();
    },
    [guardLocked, nextSort, nodeLocked, reload, supabase, taskLocked],
  );

  const applyNodeMove = useCallback(
    async (nodeId: string, rawParentId: string | null, index: number) => {
      const move = getNodeMove(nodesRef.current, nodeId, rawParentId, index);
      if (!move) {
        toast.error("Can't move a summary row into its own branch");
        return;
      }
      if (guardLocked(nodeLocked(nodeId) || (!!move.parentId && nodeLocked(move.parentId)))) {
        return;
      }
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;
      const targetCodes = new Set(
        nodesRef.current
          .filter((n) => (n.parent_id ?? null) === move.parentId && n.id !== nodeId)
          .map((n) => n.wbs_code),
      );
      const code = uniqueSiblingCode(node.wbs_code, targetCodes);
      const { error } = await updateWbsNodeById({ parent_id: move.parentId, sort_order: move.sortOrder, wbs_code: code }, nodeId);
      if (error) {
        toast.error("Failed to move: " + error.message);
        return;
      }
      for (const s of move.reorderedSiblings.filter((s) => s.id !== nodeId)) {
        await updateWbsNodeById({ sort_order: s.sortOrder }, s.id);
      }
      await reload();
    },
    [guardLocked, nodeLocked, reload, supabase],
  );

  const indentRow = useCallback(
    async (rowId: string) => {
      if (rowId.startsWith("node:project:")) return;
      const idx = flatRows.findIndex((r) => r.id === rowId);
      if (idx <= 0) return;
      const row = flatRows[idx];
      const prev = flatRows[idx - 1];
      if (row.kind === "task") {
        let target: string | null = null;
        if (prev.kind === "node") target = prev.node.id;
        else if (prev.kind === "task" && prev.task.wbs_node_id !== row.task.wbs_node_id)
          target = prev.task.wbs_node_id;
        if (!target || target === row.task.wbs_node_id) {
          toast.message("Add a summary row above to indent into");
          return;
        }
        await moveTaskToNode(row.task.id, target);
      } else {
        const siblings = nodesRef.current
          .filter((n) => (n.parent_id ?? null) === (row.node.parent_id ?? null))
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.wbs_code.localeCompare(b.wbs_code));
        const pos = siblings.findIndex((n) => n.id === row.node.id);
        if (pos <= 0) {
          toast.message("No summary row above to nest under");
          return;
        }
        await applyNodeMove(row.node.id, siblings[pos - 1].id, Number.MAX_SAFE_INTEGER);
      }
    },
    [applyNodeMove, flatRows, moveTaskToNode],
  );

  const outdentRow = useCallback(
    async (rowId: string) => {
      if (rowId.startsWith("node:project:")) return;
      const row = flatRows.find((r) => r.id === rowId);
      if (!row) return;
      if (row.kind === "task") {
        const cur = nodesRef.current.find((n) => n.id === row.task.wbs_node_id);
        if (!cur || !cur.parent_id) {
          toast.message("Already at the top level");
          return;
        }
        await moveTaskToNode(row.task.id, cur.parent_id);
      } else {
        if (!row.node.parent_id) {
          toast.message("Already at the top level");
          return;
        }
        const parent = nodesRef.current.find((n) => n.id === row.node.parent_id);
        await applyNodeMove(row.node.id, parent?.parent_id ?? null, Number.MAX_SAFE_INTEGER);
      }
    },
    [applyNodeMove, flatRows, moveTaskToNode],
  );

  const moveRow = useCallback(
    async (dragId: string, parentId: string | null, index: number) => {
      if (dragId.startsWith("node:project:")) return; // the project row never moves
      const rawParent =
        parentId && parentId.startsWith("node:") ? parentId.slice(5) : null;
      // Dropping onto the synthetic project row means "make it a root".
      const parentNodeId = rawParent && rawParent.startsWith("project:") ? null : rawParent;
      if (dragId.startsWith("task:")) {
        if (!parentNodeId) {
          toast.message("Tasks must sit under a summary row");
          return;
        }
        await moveTaskToNode(dragId.slice(5), parentNodeId);
      } else if (dragId.startsWith("node:")) {
        await applyNodeMove(dragId.slice(5), parentNodeId, index);
      }
    },
    [applyNodeMove, moveTaskToNode],
  );

  const actions = useMemo<SheetActions>(() => {
    if (readOnly) {
      const blocked = async () => {
        toast.message("Read-only — you're viewing a saved schedule. Switch View to \"Live\" to edit.");
      };
      return {
        createTask: blocked,
        updateTaskField: blocked,
        deleteTask: blocked,
        createNode: blocked,
        renameNode: blocked,
        deleteNode: blocked,
        indentRow: blocked,
        outdentRow: blocked,
        moveRow: blocked,
        setPredecessors: blocked,
        linkTasks: blocked,
        updateLink: blocked,
        removeLink: blocked,
        rescheduleTask: blocked,
        setProgress: () => {
          toast.message("Read-only — you're viewing a saved schedule. Switch View to \"Live\" to edit.");
        },
        toggleMilestone: blocked,
        toggleManualSchedule: blocked,
        setConstraint: blocked,
        assignOwner: blocked,
        runAutoSchedule: blocked,
        renumberWbsCodes: blocked,
        setWbsCode: blocked,
      };
    }
    return {
      createTask,
      updateTaskField,
      deleteTask,
      createNode,
      renameNode,
      deleteNode,
      indentRow,
      outdentRow,
      moveRow,
      setPredecessors,
      linkTasks,
      updateLink,
      removeLink,
      rescheduleTask,
      setProgress,
      toggleMilestone,
      toggleManualSchedule,
      setConstraint,
      assignOwner,
      runAutoSchedule,
      renumberWbsCodes,
      setWbsCode,
    };
  },
    [
      readOnly,
      createTask,
      updateTaskField,
      deleteTask,
      createNode,
      renameNode,
      deleteNode,
      indentRow,
      outdentRow,
      moveRow,
      setPredecessors,
      linkTasks,
      updateLink,
      removeLink,
      rescheduleTask,
      setProgress,
      toggleMilestone,
      toggleManualSchedule,
      setConstraint,
      assignOwner,
      runAutoSchedule,
      renumberWbsCodes,
      setWbsCode,
    ],
  );

  const updateFloatThresholds = useCallback(
    async (next: FloatThresholds) => {
      setFloatThresholds(next);
      try {
        await upsertPlanScheduleSetting({
            project_id: projectId,
            critical_float_threshold_days: next.critical,
            near_critical_float_threshold_days: next.nearCritical,
            updated_at: new Date().toISOString(),
          });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save float settings");
      }
    },
    [projectId, supabase],
  );

  /**
   * Advances the project's schedule data date (Completion Plan F2 / 1.2):
   * moves data_date forward, captures a progress snapshot, and reruns the
   * engine from the new date. Throws on failure so the calling dialog can
   * show the error inline instead of a toast.
   */
  const advanceDataDate = useCallback(
    async (newDate: string, note?: string) => {
      const { data, error } = await advanceDataDateRpc({
        p_project_id: projectId,
        p_new_date: newDate,
        p_note: note ?? null,
      });
      if (error) throw new Error(error.message);
      setDataDate(newDate);
      await applySchedule([], { force: true, silent: true });
      const reportJobId = (data as { report_job_id?: string } | null)?.report_job_id;
      if (reportJobId) {
        // Fire-and-forget — the monthly report is a background job; its
        // success/failure doesn't block the data-date advance the user is
        // waiting on. Failures are visible via plan_report_jobs.status.
        fetch(`/api/planning/reports/monthly/${projectId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: reportJobId }),
        }).catch((e) => console.error("Monthly report generation failed to start:", e));
      }
    },
    [projectId, supabase, applySchedule],
  );

  const updateProgressLineSettings = useCallback(
    async (next: ProgressLineStyle) => {
      setProgressLineStyle(next);
      try {
        await upsertPlanScheduleSetting({
            project_id: projectId,
            progress_line_date_source: next.dateSource,
            progress_line_custom_date: next.customDate,
            progress_line_color: next.color,
            progress_line_point_shape: next.pointShape,
            progress_line_point_color: next.pointColor,
            progress_line_show_date: next.showDate,
            updated_at: new Date().toISOString(),
          });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save progress line settings");
      }
    },
    [projectId, supabase],
  );

  const updateBarStyle = useCallback(
    async (next: GanttBarStyleSettings) => {
      setBarStyle(next);
      try {
        await upsertPlanScheduleSetting({
            project_id: projectId,
            bar_style: next,
            updated_at: new Date().toISOString(),
          });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save bar style");
      }
    },
    [projectId, supabase],
  );

  return {
    loading,
    tree,
    flatRows,
    rowNumberById,
    tasks: viewTasks,
    taskById,
    taskCount: viewTasks.length,
    capped: viewTasks.length >= TASK_LIMIT,
    nextCodePreview,
    project,
    calendar,
    dataDate,
    float: analysis.float,
    violations: analysis.violations,
    scheduleError: analysis.error,
    kpis,
    advanceDataDate,
    pendingProgressReviewTaskIds,
    lockedRowIds,
    lockedTaskIds,
    wbsCodeMask,
    wbsCodeByRowId,
    autoSchedule,
    setAutoSchedule,
    calcNeeded,
    floatThresholds,
    updateFloatThresholds,
    progressLineStyle,
    updateProgressLineSettings,
    barStyle,
    updateBarStyle,
    reload,
    actions,
  };
}
