"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Loader2, Table2 } from "lucide-react";
import type { TreeApi } from "react-arborist";
import { useProject } from "@/components/dashboard/project-context";
import { useIsWbsManager } from "@/hooks/use-is-wbs-manager";
import { depsFromArrays, type DepType } from "@/lib/planning/schedule-engine";
import { activateBaseline, listBaselines, type BaselineRow } from "@/lib/planning/baseline-service";
import {
  listComparisonSources,
  resolveSource,
  type ComparisonSource,
  type ComparisonSourceOption,
} from "@/lib/planning/schedule-comparison-service";
import {
  applyZoomPreset,
  DEFAULT_TIMESCALE,
  parseTimescaleConfig,
  resolveDayWidth,
  tierRowHeights,
  type TimescaleConfig,
} from "@/lib/planning/timescale";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { GanttDependencyEditor } from "./gantt-dependency-editor";
import { PlanMoveProjectDialog } from "./plan-move-project-dialog";
import { PlanSetBaselineDialog } from "./plan-set-baseline-dialog";
import { PlanTimescaleDialog } from "./plan-timescale-dialog";
import { PlanWbsCodeDialog } from "./plan-wbs-code-dialog";
import { PlanWorkingTimeDialog } from "./plan-working-time-dialog";
import { PlanSheetDetailPanel } from "./plan-sheet-detail-panel";
import { ScheduleTimeline, toGanttTask } from "./schedule-timeline";
import { ScheduleToolbar } from "./schedule-toolbar";
import { SheetGrid } from "./sheet-grid";
import { ROW_HEIGHT, type SheetRow } from "./sheet-types";
import { filterIncomplete, visibleRowsFrom } from "./sheet-utils";
import { useColumnPreferences } from "./use-column-preferences";
import { useSheetData } from "./use-sheet-data";
import { computeDateRange, getTotalDays, toX } from "./gantt-utils";
import type { GanttZoom } from "./gantt-types";

const GRID_W_KEY = "dcos.schedule.gridW";
const GRID_W_MIN = 320;
const GRID_W_MAX = 1200;
const GRID_W_DEFAULT = 720;

interface PlanScheduleViewProps {
  /** Start with the Gantt pane collapsed (Planning ▸ Sheet renders it this way). */
  showTimeline?: boolean;
  /**
   * "sheet" replaces the right-hand pane with a task detail/assignment panel
   * bound to the selected row instead of the Gantt bars — Planning ▸ Gantt
   * Chart already owns the timeline, so Sheet's pane is dedicated to detail.
   */
  variant?: "gantt" | "sheet";
}

export function PlanScheduleView({
  showTimeline: initialShowTimeline = true,
  variant = "gantt",
}: PlanScheduleViewProps) {
  const { selectedProjectId, loading: projectLoading } = useProject();
  const isManager = useIsWbsManager();
  const data = useSheetData(selectedProjectId, isManager);
  const columnPrefs = useColumnPreferences();
  const isSheet = variant === "sheet";

  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const selectedRowId = selectedRowIds.at(-1) ?? null; // primary = last clicked
  const selectedRowIdSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [showTimeline, setShowTimeline] = useState(isSheet ? false : initialShowTimeline);
  const [zoom, setZoom] = useState<GanttZoom>("week");
  const [zoomScale, setZoomScale] = useState(1);
  const [timescaleConfig, setTimescaleConfig] = useState<TimescaleConfig>(() =>
    applyZoomPreset(DEFAULT_TIMESCALE, "week"),
  );
  const [timescaleOpen, setTimescaleOpen] = useState(false);
  // Reference ghost-bar: which schedule (Baseline / Internal rev / External
  // rev) draws behind the live bars. "" = none. Defaults to the active
  // Baseline once loaded, matching the old always-on Baseline toggle.
  const [referenceOptions, setReferenceOptions] = useState<ComparisonSourceOption[]>([]);
  const [referenceKey, setReferenceKey] = useState<string>("");
  const [referenceDates, setReferenceDates] = useState<Map<
    string,
    { start: string | null; end: string | null }
  > | null>(null);
  const [showDependencies, setShowDependencies] = useState(true);
  const [showToday, setShowToday] = useState(true);
  const [showCritical, setShowCritical] = useState(true);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [editLink, setEditLink] = useState<{ successorId: string; index: number } | null>(null);
  const [savingLink, setSavingLink] = useState(false);
  const [linkDrag, setLinkDrag] = useState<{
    fromId: string;
    ox: number;
    oy: number;
    x: number;
    y: number;
  } | null>(null);
  const [gridW, setGridW] = useState(GRID_W_DEFAULT);

  // MS-Project "Project" tools
  const [projDialog, setProjDialog] = useState<
    null | "wbs" | "workingTime" | "baseline" | "move"
  >(null);
  const [baselines, setBaselines] = useState<BaselineRow[]>([]);

  const treeApiRef = useRef<TreeApi<SheetRow> | null>(null);
  const gridPaneRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const isSyncingScroll = useRef(false);
  const fitModeRef = useRef(true);
  const didAutoFitRef = useRef(false);
  /** True once a saved timescale is loaded / the user saves one — Fit then only
   * rescales and never swaps the tiers back to a Day/Week/Month preset. */
  const hasSavedTimescaleRef = useRef(false);

  const registerTree = useCallback((api: TreeApi<SheetRow> | null) => {
    treeApiRef.current = api;
  }, []);

  // Restore the persisted splitter position after mount (localStorage is client-only).
  useEffect(() => {
    const saved = Number(window.localStorage.getItem(GRID_W_KEY));
    if (saved >= GRID_W_MIN && saved <= GRID_W_MAX) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGridW(saved);
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(GRID_W_KEY, String(gridW));
    } catch {
      /* ignore */
    }
  }, [gridW]);

  // -------------------------------------------------------------------------
  // Rows — one list drives BOTH panes, so they can never fall out of alignment.
  // -------------------------------------------------------------------------
  const filteredTree = useMemo(
    () => (hideCompleted ? filterIncomplete(data.tree) : data.tree),
    [data.tree, hideCompleted],
  );
  const visibleRows = useMemo(
    () => visibleRowsFrom(filteredTree, collapsedIds),
    [filteredTree, collapsedIds],
  );
  /** The grid renders this filtered tree; every other field stays the full, unfiltered data
   *  (row numbers / WBS codes must stay stable regardless of what the filter hides). */
  const gridData = useMemo(() => ({ ...data, tree: filteredTree }), [data, filteredTree]);

  const handleToggleRow = useCallback((rowId: string, open: boolean) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (open) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    treeApiRef.current?.openAll();
    setCollapsedIds(new Set());
  }, []);

  const handleCollapseAll = useCallback(() => {
    treeApiRef.current?.closeAll();
    setCollapsedIds(
      new Set(
        data.flatRows
          .filter((r) => r.children.length && !r.id.startsWith("node:project:"))
          .map((r) => r.id),
      ),
    );
  }, [data.flatRows]);

  // -------------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------------
  const selectedTaskId = useMemo(
    () => (selectedRowId?.startsWith("task:") ? selectedRowId.slice(5) : null),
    [selectedRowId],
  );
  const selectedTask = selectedTaskId ? data.taskById.get(selectedTaskId) ?? null : null;
  /** Whether the grid has a resizable companion pane to its right at all. */
  const hasRightPane = isSheet || showTimeline;

  /** All selected task ids (multi-select) — for the timeline highlight + chain link. */
  const selectedTaskIdSet = useMemo(
    () =>
      new Set(
        selectedRowIds.filter((id) => id.startsWith("task:")).map((id) => id.slice(5)),
      ),
    [selectedRowIds],
  );

  // Refs so the select handler stays a stable callback (it feeds a memoised ctx).
  const selectedRowIdsRef = useRef(selectedRowIds);
  const visibleOrderRef = useRef<string[]>([]);
  const selectionAnchorRef = useRef<string | null>(null);
  useEffect(() => {
    selectedRowIdsRef.current = selectedRowIds;
  });
  useEffect(() => {
    visibleOrderRef.current = visibleRows.map((v) => v.row.id);
  });

  const handleSelectRow = useCallback(
    (rowId: string | null, mods?: { additive?: boolean; range?: boolean }) => {
      if (rowId == null) {
        setSelectedRowIds([]);
        selectionAnchorRef.current = null;
        return;
      }
      const cur = selectedRowIdsRef.current;
      const prevPrimary = cur.at(-1) ?? null;

      // Shift → range from the anchor to here, in on-screen order.
      if (mods?.range && selectionAnchorRef.current) {
        const order = visibleOrderRef.current;
        const a = order.indexOf(selectionAnchorRef.current);
        const b = order.indexOf(rowId);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          setSelectedRowIds(order.slice(lo, hi + 1));
          return;
        }
      }

      // Ctrl/⌘ → toggle this row in/out of the selection.
      if (mods?.additive) {
        setSelectedRowIds((p) =>
          p.includes(rowId)
            ? p.length > 1
              ? p.filter((id) => id !== rowId)
              : p
            : [...p, rowId],
        );
        selectionAnchorRef.current = rowId;
        return;
      }

      // Plain click → single select. Remember the previously selected task so the
      // 2-click "Link" flow still works.
      if (prevPrimary?.startsWith("task:") && prevPrimary !== rowId) {
        setLinkSourceId(prevPrimary.slice(5));
      }
      setSelectedRowIds([rowId]);
      selectionAnchorRef.current = rowId;
    },
    [],
  );

  // -------------------------------------------------------------------------
  // MS-Project "Project" tools
  // -------------------------------------------------------------------------
  const refreshBaselines = useCallback(() => {
    if (!selectedProjectId) return;
    listBaselines(selectedProjectId).then(setBaselines).catch(() => {});
  }, [selectedProjectId]);
  useEffect(() => {
    refreshBaselines();
  }, [refreshBaselines]);

  // Reference ghost-bar options: Live is excluded (it IS the main bars already).
  const refreshReferenceOptions = useCallback(() => {
    if (!selectedProjectId) return;
    listComparisonSources(selectedProjectId)
      .then((opts) => {
        const nonLive = opts.filter((o) => o.source.kind !== "live");
        setReferenceOptions(nonLive);
        setReferenceKey((prev) => {
          if (prev && nonLive.some((o) => o.key === prev)) return prev;
          const active = nonLive.find((o) => o.source.kind === "baseline" && o.label.endsWith("(active)"));
          return active?.key ?? "";
        });
      })
      .catch(() => {});
  }, [selectedProjectId]);
  useEffect(() => {
    refreshReferenceOptions();
  }, [refreshReferenceOptions]);

  const referenceSource: ComparisonSource | null =
    referenceOptions.find((o) => o.key === referenceKey)?.source ?? null;
  const referenceLabel = referenceOptions.find((o) => o.key === referenceKey)?.label ?? "Baseline";

  useEffect(() => {
    if (!selectedProjectId || !referenceSource) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setReferenceDates(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    let cancelled = false;
    resolveSource(selectedProjectId, referenceSource)
      .then((map) => {
        if (!cancelled) setReferenceDates(map);
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : String(e));
        setReferenceDates(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, referenceKey]);

  // Load the saved timescale config for this project.
  useEffect(() => {
    if (!selectedProjectId) return;
    let alive = true;
    hasSavedTimescaleRef.current = false;
    (async () => {
      try {
        const { data: row } = await createClient()
          .from("plan_timescale")
          .select("config")
          .eq("project_id", selectedProjectId)
          .maybeSingle();
        if (!alive) return;
        if (row) hasSavedTimescaleRef.current = true;
        setTimescaleConfig(parseTimescaleConfig(row));
      } catch {
        /* keep the current config */
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedProjectId]);

  const currentStart = useMemo(() => {
    const starts = data.tasks.map((t) => t.start_date).filter((s): s is string => !!s);
    return starts.length ? starts.sort()[0] : data.dataDate ?? new Date().toISOString().slice(0, 10);
  }, [data.tasks, data.dataDate]);

  /** Task ids in scope for "Set Baseline · Selected tasks". */
  const selectedTaskIds = useMemo(() => {
    if (!selectedRowId) return [];
    if (selectedRowId.startsWith("task:")) return [selectedRowId.slice(5)];
    const row = data.flatRows.find((r) => r.id === selectedRowId);
    if (row?.kind !== "node") return [];
    const out: string[] = [];
    const walk = (rows: SheetRow[]) => {
      for (const r of rows) {
        if (r.kind === "task") out.push(r.task.id);
        if (r.children.length) walk(r.children);
      }
    };
    walk(row.children);
    return out;
  }, [selectedRowId, data.flatRows]);

  /** First few outline rows for the WBS-code dialog preview. */
  const wbsSampleRows = useMemo(() => {
    const out: { path: number[]; name: string }[] = [];
    const walk = (rows: SheetRow[], path: number[]) => {
      rows.forEach((r, i) => {
        if (out.length >= 8) return;
        const isProjectRow = r.kind === "node" && r.node.node_type === "project";
        const here = isProjectRow ? [] : [...path, i + 1];
        if (!isProjectRow) {
          out.push({
            path: here,
            name: r.kind === "task" ? r.task.task_name : r.node.wbs_name,
          });
        }
        if (r.children.length) walk(r.children, here);
      });
    };
    walk(data.tree, []);
    return out;
  }, [data.tree]);

  const handleActivateBaseline = useCallback(
    async (n: number) => {
      if (!selectedProjectId) return;
      try {
        await activateBaseline(selectedProjectId, n);
        setReferenceKey(`baseline:${n}`);
        await data.reload();
        refreshBaselines();
        refreshReferenceOptions();
      } catch {
        /* toast handled in the service caller path */
      }
    },
    [selectedProjectId, data, refreshBaselines, refreshReferenceOptions],
  );

  // F9 = Calculate Project
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F9") {
        e.preventDefault();
        void data.actions.runAutoSchedule();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data.actions]);

  // -------------------------------------------------------------------------
  // Timeline geometry
  // -------------------------------------------------------------------------
  const ganttTasks = useMemo(
    () => data.tasks.map((t) => toGanttTask(t, data.float.get(t.id))),
    [data.tasks, data.float],
  );
  // When "Today" is on, widen the range so the marker is always on-canvas even
  // when every task sits in the past / future.
  const todayIso = new Date().toISOString().slice(0, 10);
  const dateRange = useMemo(() => {
    const base = computeDateRange(ganttTasks);
    if (!showToday) return base;
    const today = new Date(todayIso);
    return {
      min: today < base.min ? today : base.min,
      max: today > base.max ? today : base.max,
    };
  }, [ganttTasks, showToday, todayIso]);
  const totalDays = getTotalDays(dateRange.min, dateRange.max);
  const dayW = resolveDayWidth(timescaleConfig, zoomScale);
  const chartW = totalDays * dayW;
  const headerH = useMemo(() => tierRowHeights(timescaleConfig).total, [timescaleConfig]);

  const todayX = showToday ? toX(todayIso, dateRange.min, dayW) : -1;
  const dataDateX = data.dataDate ? toX(data.dataDate, dateRange.min, dayW) : -1;

  const handleFitToScreen = useCallback(() => {
    const el = timelineRef.current;
    if (!el || totalDays <= 0) return;
    const available = Math.max(240, el.clientWidth - 48);
    const targetDayW = Math.max(0.4, available / totalDays);
    fitModeRef.current = true;
    if (hasSavedTimescaleRef.current) {
      // Keep the saved tiers — just rescale to fit the viewport.
      setZoomScale(targetDayW / resolveDayWidth(timescaleConfig, 1));
    } else {
      const nextZoom: GanttZoom =
        targetDayW < 4 ? "month" : targetDayW < 14 ? "week" : "day";
      const next = applyZoomPreset(timescaleConfig, nextZoom);
      setZoom(nextZoom);
      setTimescaleConfig(next);
      setZoomScale(targetDayW / resolveDayWidth(next, 1));
    }
    requestAnimationFrame(() => {
      el.scrollLeft = 0;
    });
  }, [totalDays, timescaleConfig]);

  const handleZoomChange = useCallback((z: GanttZoom) => {
    fitModeRef.current = false;
    setZoom(z);
    setZoomScale(1);
    setTimescaleConfig((c) => applyZoomPreset(c, z));
  }, []);
  const handleZoomIn = useCallback(() => {
    fitModeRef.current = false;
    setZoomScale((s) => Math.min(6, s * 1.35));
  }, []);
  const handleZoomOut = useCallback(() => {
    fitModeRef.current = false;
    setZoomScale((s) => Math.max(0.05, s / 1.35));
  }, []);

  useEffect(() => {
    didAutoFitRef.current = false;
  }, [selectedProjectId]);

  useEffect(() => {
    if (!showTimeline || data.loading || totalDays <= 0 || visibleRows.length === 0) return;
    if (didAutoFitRef.current && !fitModeRef.current) return;
    didAutoFitRef.current = true;
    const id = requestAnimationFrame(() => handleFitToScreen());
    return () => cancelAnimationFrame(id);
  }, [showTimeline, data.loading, totalDays, visibleRows.length, handleFitToScreen]);

  // "Today" is a toggle: pick = show the line, unpick = hide it.
  const handleToday = useCallback(() => setShowToday((v) => !v), []);

  // Bring the line into view only on the pick → not on every zoom / reload.
  const prevShowTodayRef = useRef(showToday);
  useEffect(() => {
    const justEnabled = showToday && !prevShowTodayRef.current;
    prevShowTodayRef.current = showToday;
    if (!justEnabled) return;
    const el = timelineRef.current;
    if (!el || todayX < 0) return;
    const id = requestAnimationFrame(() => {
      el.scrollLeft = Math.max(0, todayX - el.clientWidth / 2);
    });
    return () => cancelAnimationFrame(id);
  }, [showToday, todayX]);

  // -------------------------------------------------------------------------
  // Vertical scroll sync between the two panes
  // -------------------------------------------------------------------------
  const syncFrom = useCallback((source: "grid" | "timeline") => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    const g = gridPaneRef.current;
    const t = timelineRef.current;
    if (g && t) {
      if (source === "grid") t.scrollTop = g.scrollTop;
      else g.scrollTop = t.scrollTop;
    }
    requestAnimationFrame(() => {
      isSyncingScroll.current = false;
    });
  }, []);

  // -------------------------------------------------------------------------
  // Splitter
  // -------------------------------------------------------------------------
  const handleResizeStart = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = gridW;
      const onMove = (ev: MouseEvent) => {
        setGridW(Math.min(GRID_W_MAX, Math.max(GRID_W_MIN, startW + (ev.clientX - startX))));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      };
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [gridW],
  );

  // -------------------------------------------------------------------------
  // Dependency links
  // -------------------------------------------------------------------------
  const { linkTasks, removeLink, updateLink, rescheduleTask } = data.actions;

  const handleStartLink = useCallback((fromId: string, e: ReactMouseEvent) => {
    setLinkDrag({ fromId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    if (!linkDrag) return;
    const move = (e: MouseEvent) =>
      setLinkDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    const up = (e: MouseEvent) => {
      // Walk every element under the cursor (the overlay SVG may sit on top)
      // and take the first that resolves to a task row.
      let toId: string | null = null;
      for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
        const row = (el as HTMLElement).closest?.("[data-gantt-task]") as HTMLElement | null;
        if (row?.dataset.ganttTask) {
          toId = row.dataset.ganttTask;
          break;
        }
      }
      const fromId = linkDrag.fromId;
      setLinkDrag(null);
      if (toId && toId !== fromId) void linkTasks(fromId, toId);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    document.body.style.cursor = "crosshair";
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
    };
  }, [linkDrag, linkTasks]);

  const editContext = useMemo(() => {
    if (!editLink) return null;
    const succ = data.taskById.get(editLink.successorId);
    if (!succ) return null;
    const deps = depsFromArrays(
      succ.dependency_task_ids,
      succ.dependency_types,
      succ.dependency_lag_days,
    );
    const dep = deps[editLink.index];
    const pred = dep ? data.taskById.get(dep.predId) : undefined;
    if (!dep || !pred) return null;
    return {
      successor: toGanttTask(succ, data.float.get(succ.id)),
      predecessor: toGanttTask(pred, data.float.get(pred.id)),
      type: dep.type as string,
      lag: dep.lag,
    };
  }, [editLink, data.taskById, data.float]);

  const handleSaveLink = useCallback(
    async (type: string, lag: number) => {
      if (!editLink) return;
      setSavingLink(true);
      await updateLink(editLink.successorId, editLink.index, type.toLowerCase() as DepType, lag);
      setSavingLink(false);
      setEditLink(null);
    },
    [editLink, updateLink],
  );

  const handleRemoveLink = useCallback(async () => {
    if (!editLink) return;
    setSavingLink(true);
    await removeLink(editLink.successorId, editLink.index);
    setSavingLink(false);
    setEditLink(null);
  }, [editLink, removeLink]);

  const unlinkTask = useCallback(
    async (taskId: string) => {
      const task = data.taskById.get(taskId);
      const count = task?.dependency_task_ids?.length ?? 0;
      for (let i = count - 1; i >= 0; i--) await removeLink(taskId, i);
    },
    [data.taskById, removeLink],
  );

  const handleUnlinkSelected = useCallback(async () => {
    const ids = [...selectedTaskIdSet];
    for (const id of ids.length ? ids : selectedTaskId ? [selectedTaskId] : []) {
      await unlinkTask(id);
    }
  }, [selectedTaskIdSet, selectedTaskId, unlinkTask]);

  // Chain-link every selected task Finish-to-Start, in on-screen order.
  const linkSelectedChain = useCallback(async () => {
    const order: string[] = visibleRows.map((v) => v.row.id);
    const ids = selectedRowIds
      .filter((id) => id.startsWith("task:"))
      .slice()
      .sort((a, b) => order.indexOf(a) - order.indexOf(b))
      .map((id) => id.slice(5));
    if (ids.length >= 2) {
      for (let i = 1; i < ids.length; i++) await linkTasks(ids[i - 1], ids[i]);
      return;
    }
    if (linkSourceId && selectedTaskId && linkSourceId !== selectedTaskId) {
      await linkTasks(linkSourceId, selectedTaskId);
    }
  }, [visibleRows, selectedRowIds, linkTasks, linkSourceId, selectedTaskId]);

  const handleScrollToRow = useCallback(
    (rowId: string) => {
      const el = timelineRef.current;
      if (!el) return;
      const idx = visibleRows.findIndex((v) => v.row.id === rowId);
      if (idx < 0) return;
      const vr = visibleRows[idx];
      const startIso =
        vr.row.kind === "task" ? vr.row.task.start_date : vr.row.rollup.start;
      if (startIso) {
        el.scrollLeft = Math.max(
          0,
          toX(startIso, dateRange.min, dayW) - el.clientWidth / 2,
        );
      }
      el.scrollTop = Math.max(0, idx * ROW_HEIGHT - el.clientHeight / 2);
    },
    [visibleRows, dateRange.min, dayW],
  );

  const parentForSummary = useCallback((): string | null => {
    if (!selectedRowId) return null;
    const row = data.flatRows.find((r) => r.id === selectedRowId);
    if (row?.kind !== "node") return null;
    // "Add summary row" under the project row means a new root.
    return row.node.id.startsWith("project:") ? null : row.node.id;
  }, [selectedRowId, data.flatRows]);

  // -------------------------------------------------------------------------
  // Guards
  // -------------------------------------------------------------------------
  if (projectLoading || data.loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!selectedProjectId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <Table2 className="h-10 w-10 opacity-30" />
        <p className="text-sm">Select a project from the header to open its schedule.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <ScheduleToolbar
        taskCount={data.taskCount}
        capped={data.capped}
        selectedRowId={selectedRowId}
        linkSourceId={linkSourceId}
        linkTargetId={selectedTaskId}
        linkCount={selectedTaskIdSet.size}
        calendarName={data.calendar.name}
        scheduleError={data.scheduleError}
        autoSchedule={data.autoSchedule}
        showTimeline={showTimeline}
        showTimelineToggle={!isSheet}
        zoom={zoom}
        referenceOptions={referenceOptions}
        referenceKey={referenceKey}
        showDependencies={showDependencies}
        showToday={showToday}
        showCritical={showCritical}
        hideCompleted={hideCompleted}
        onAddTask={() => data.actions.createTask("New task", selectedRowId)}
        onAddSummary={() => data.actions.createNode("New group", parentForSummary())}
        onIndent={() => selectedRowId && data.actions.indentRow(selectedRowId)}
        onOutdent={() => selectedRowId && data.actions.outdentRow(selectedRowId)}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
        onRefresh={() => data.reload()}
        onLink={() => void linkSelectedChain()}
        onUnlink={handleUnlinkSelected}
        onZoomChange={handleZoomChange}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitToScreen={handleFitToScreen}
        onToday={handleToday}
        onReferenceChange={setReferenceKey}
        onDependenciesToggle={setShowDependencies}
        onCriticalToggle={setShowCritical}
        onHideCompletedToggle={setHideCompleted}
        onAutoScheduleToggle={data.setAutoSchedule}
        onRunAutoSchedule={() => data.actions.runAutoSchedule()}
        onToggleTimeline={() => setShowTimeline((v) => !v)}
        calcNeeded={data.calcNeeded}
        baselines={baselines.map((b) => ({
          number: b.baseline_number,
          name: b.baseline_name,
          active: b.is_active,
        }))}
        onOpenWbsCode={() => setProjDialog("wbs")}
        onOpenWorkingTime={() => setProjDialog("workingTime")}
        onOpenSetBaseline={() => setProjDialog("baseline")}
        onOpenMoveProject={() => setProjDialog("move")}
        onActivateBaseline={handleActivateBaseline}
        columnOrder={columnPrefs.order}
        columnVisibility={columnPrefs.visibility}
        onColumnVisibilityChange={columnPrefs.setVisibility}
        onResetColumns={columnPrefs.resetToDefault}
      />

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
        {/* Left: editable grid */}
        <div
          ref={gridPaneRef}
          onScroll={() => syncFrom("grid")}
          className={cn("shrink-0 overflow-auto", !hasRightPane && "flex-1")}
          style={hasRightPane ? { width: gridW } : undefined}
        >
          <SheetGrid
            data={gridData}
            selectedRowId={selectedRowId}
            selectedRowIds={selectedRowIdSet}
            onSelectedRowChange={handleSelectRow}
            registerTree={registerTree}
            onToggleRow={handleToggleRow}
            visibleCount={visibleRows.length}
            headerHeight={showTimeline ? headerH : undefined}
            onLinkSelected={() => void linkSelectedChain()}
            onUnlinkRow={(id) => void unlinkTask(id.slice(5))}
            onScrollToRow={handleScrollToRow}
            canLinkSelected={selectedTaskIdSet.size >= 2}
            showCritical={showCritical}
            emptyState={
              hideCompleted && data.taskCount > 0
                ? { title: "All caught up.", hint: 'Every task is at 100% complete — turn off "Hide Completed" to see them.' }
                : undefined
            }
            columnOrder={columnPrefs.order}
            columnVisibility={columnPrefs.visibility}
            colWidths={columnPrefs.widths}
            onColumnOrderChange={columnPrefs.setOrder}
            onColumnVisibilityChange={columnPrefs.setVisibility}
            onColWidthsChange={columnPrefs.setWidths}
          />
        </div>

        {hasRightPane && (
          <>
            {/* Splitter */}
            <div
              role="separator"
              aria-orientation="vertical"
              title="Drag to resize · double-click to reset"
              onMouseDown={handleResizeStart}
              onDoubleClick={() => setGridW(GRID_W_DEFAULT)}
              className="group relative z-10 flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-border transition-colors hover:bg-primary/40"
            >
              <span className="absolute inset-y-0 -left-1.5 -right-1.5" />
              <span className="h-8 w-0.5 rounded bg-muted-foreground/30 group-hover:bg-primary/60" />
            </div>

            {/* Right: task detail (Sheet) */}
            {isSheet && (
              <div className="min-w-0 flex-1 overflow-auto">
                <PlanSheetDetailPanel
                  key={selectedTaskId ?? "none"}
                  task={selectedTask}
                  wbsPath={selectedTaskId ? data.wbsCodeByRowId.get(`task:${selectedTaskId}`) ?? null : null}
                  onUpdateField={data.actions.updateTaskField}
                  onAssign={data.actions.assignOwner}
                />
              </div>
            )}

            {/* Right: timeline (Gantt Chart) */}
            {!isSheet && showTimeline && (
              <div
                ref={timelineRef}
                onScroll={() => syncFrom("timeline")}
                className="min-w-0 flex-1 overflow-auto"
              >
                <ScheduleTimeline
                  visibleRows={visibleRows}
                  rowHeight={ROW_HEIGHT}
                  headerHeight={headerH}
                  zoom={zoom}
                  timescale={timescaleConfig}
                  calendar={data.calendar}
                  dayWidth={dayW}
                  rangeMin={dateRange.min}
                  rangeMax={dateRange.max}
                  totalDays={totalDays}
                  float={data.float}
                  lockedTaskIds={data.lockedTaskIds}
                  referenceDates={referenceDates}
                  referenceLabel={referenceLabel}
                  showDependencies={showDependencies}
                  showCritical={showCritical}
                  selectedTaskIds={selectedTaskIdSet}
                  todayX={todayX}
                  dataDateX={dataDateX}
                  onSelectRow={handleSelectRow}
                  onReschedule={rescheduleTask}
                  onStartLink={handleStartLink}
                  onEditLink={(succId, index) => setEditLink({ successorId: succId, index })}
                  onSetProgress={data.actions.setProgress}
                  onOpenTimescale={() => setTimescaleOpen(true)}
                />
                {/* Keep the blank add-row strip's height so both panes end level. */}
                <div style={{ height: ROW_HEIGHT, width: Math.max(chartW, 1) }} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Relation editor */}
      {editContext && (
        <GanttDependencyEditor
          predecessor={editContext.predecessor}
          successor={editContext.successor}
          currentType={editContext.type}
          currentLag={editContext.lag}
          saving={savingLink}
          onCancel={() => setEditLink(null)}
          onSave={handleSaveLink}
          onRemove={handleRemoveLink}
        />
      )}

      {/* MS-Project "Project" dialogs */}
      {projDialog === "wbs" && (
        <PlanWbsCodeDialog
          projectId={selectedProjectId}
          mask={data.wbsCodeMask}
          sampleRows={wbsSampleRows}
          onClose={() => setProjDialog(null)}
          onRenumber={(m) => data.actions.renumberWbsCodes(m)}
        />
      )}
      {projDialog === "workingTime" && (
        <PlanWorkingTimeDialog
          projectId={selectedProjectId}
          onClose={() => setProjDialog(null)}
          onSaved={() => data.reload()}
        />
      )}
      {projDialog === "baseline" && (
        <PlanSetBaselineDialog
          projectId={selectedProjectId}
          selectedTaskIds={selectedTaskIds}
          onClose={() => setProjDialog(null)}
          onSaved={async () => {
            await data.reload();
            refreshBaselines();
            refreshReferenceOptions();
          }}
        />
      )}
      {projDialog === "move" && (
        <PlanMoveProjectDialog
          projectId={selectedProjectId}
          currentStart={currentStart}
          calendar={data.calendar}
          blocked={data.lockedTaskIds.size > 0 && !isManager}
          onClose={() => setProjDialog(null)}
          onMoved={async () => {
            await data.reload();
            await data.actions.runAutoSchedule();
          }}
        />
      )}
      {timescaleOpen && (
        <PlanTimescaleDialog
          projectId={selectedProjectId}
          config={timescaleConfig}
          onClose={() => setTimescaleOpen(false)}
          onSaved={(next) => {
            hasSavedTimescaleRef.current = true;
            setTimescaleConfig(next);
          }}
        />
      )}

      {/* Link-drag preview line */}
      {linkDrag && (
        <svg className="pointer-events-none fixed inset-0 z-[60] h-full w-full">
          <line
            x1={linkDrag.ox}
            y1={linkDrag.oy}
            x2={linkDrag.x}
            y2={linkDrag.y}
            stroke="#6366f1"
            strokeWidth={2}
            strokeDasharray="5 3"
          />
          <circle cx={linkDrag.x} cy={linkDrag.y} r={4} fill="#6366f1" />
        </svg>
      )}
    </div>
  );
}
