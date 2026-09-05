"use client";

import { useEffect, useMemo, useState, useCallback, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useProject } from "@/components/dashboard/project-context";
import { cn } from "@/lib/utils";

import type { GanttZoom, GanttTask, GanttGroupRow, GanttDisplayRow, CpmRow } from "./gantt-types";
import { DAY_W, ROW_HEIGHT, HEADER_H, LABEL_W } from "./gantt-types";
import {
  computeDateRange,
  getTotalDays,
  toX,
  getBarWidth,
  getZoomDayWidth,
  getHeaderTickDays,
  daysBetween,
  wouldCreateCycle,
} from "./gantt-utils";

import { GanttToolbar } from "./gantt-toolbar";
import { GanttCommandBar } from "./gantt-command-bar";
import { GanttHeader } from "./gantt-header";
import { GanttBar } from "./gantt-bar";
import { GanttMilestone } from "./gantt-milestone";
import { GanttTaskTree } from "./gantt-task-tree";
import { GanttDependencyLines } from "./gantt-dependency-lines";
import { GanttDependencyEditor } from "./gantt-dependency-editor";
import { GanttLegend } from "./gantt-legend";
import { GanttSummaryBar } from "./gantt-summary-bar";
import { GanttTaskDetailDrawer } from "./gantt-task-detail-drawer";

interface GanttViewProps {
  projectId?: string;
  mode?: "full" | "embedded";
  tasks?: GanttTask[];
}

// Draggable WBS panel width bounds
const LABEL_W_MIN = 260;
const LABEL_W_MAX = 820;

interface WbsNode {
  id: string;
  parent_id: string | null;
  wbs_code: string;
  wbs_name: string;
}

interface WbsTreeNode {
  id: string;
  wbs_code: string;
  wbs_name: string;
  depth: number;
  children: WbsTreeNode[];
  tasks: GanttTask[];
}

// ---------------------------------------------------------------------------
// Build a tree from flat wbs_nodes list
// ---------------------------------------------------------------------------
function buildWbsTree(
  nodes: WbsNode[],
  tasks: GanttTask[],
  depthMap: Map<string, number>,
): WbsTreeNode[] {
  const childMap = new Map<string, WbsNode[]>();
  const taskByNode = new Map<string, GanttTask[]>();

  for (const t of tasks) {
    if (!t.wbs_node_id) continue;
    const list = taskByNode.get(t.wbs_node_id) || [];
    list.push(t);
    taskByNode.set(t.wbs_node_id, list);
  }

  for (const node of nodes) {
    if (node.parent_id) {
      const siblings = childMap.get(node.parent_id) || [];
      siblings.push(node);
      childMap.set(node.parent_id, siblings);
    }
  }

  function toTree(n: WbsNode): WbsTreeNode {
    const children = (childMap.get(n.id) || []).map(toTree);
    return {
      id: n.id,
      wbs_code: n.wbs_code,
      wbs_name: n.wbs_name,
      depth: depthMap.get(n.id) ?? 0,
      children,
      tasks: taskByNode.get(n.id) || [],
    };
  }

  return nodes.filter((n) => !n.parent_id).map(toTree);
}

export function GanttView({
  projectId: propProjectId,
  mode = "full",
  tasks: propTasks,
}: GanttViewProps) {
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId, selectedProject, loading: projectLoading } = useProject();
  const projectId = propProjectId || selectedProjectId;

  const [fetchedTasks, setFetchedTasks] = useState<GanttTask[]>([]);
  const [wbsNodes, setWbsNodes] = useState<WbsNode[]>([]);
  const [criticalIds, setCriticalIds] = useState<Set<string>>(new Set());
  const [cpmMap, setCpmMap] = useState<Map<string, CpmRow>>(new Map());
  const [loading, setLoading] = useState(mode === "full");

  const [zoom, setZoom] = useState<GanttZoom>("week");
  const [zoomScale, setZoomScale] = useState(1);
  const [levelFilter, setLevelFilter] = useState<number | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showBaseline, setShowBaseline] = useState(true);
  const [showDependencies, setShowDependencies] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [linkDrag, setLinkDrag] = useState<{ fromId: string; ox: number; oy: number; x: number; y: number } | null>(null);
  const [editLink, setEditLink] = useState<{ successorId: string; index: number } | null>(null);
  const [savingLink, setSavingLink] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(["__project__"]));
  const [labelW, setLabelW] = useState<number>(() => {
    if (typeof window === "undefined") return LABEL_W;
    const saved = Number(window.localStorage.getItem("dcos.gantt.labelW"));
    return saved >= LABEL_W_MIN && saved <= LABEL_W_MAX ? saved : LABEL_W;
  });
  const [rowOffsets, setRowOffsets] = useState<Map<string, number>>(new Map());
  const [highlightCritical, setHighlightCritical] = useState(true);
  const [autoScheduleActive, setAutoScheduleActive] = useState(true);
  const [dataDate, setDataDate] = useState<string | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);
  const taskTreeRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isSyncingScroll = useRef(false);
  // "Fit to window" stays active (re-fits on resize) until the user zooms manually
  const fitModeRef = useRef(true);
  const didAutoFitRef = useRef(false);

  // Sync vertical scroll between task tree and timeline
  const handleTaskTreeScroll = useCallback(() => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    const treeEl = taskTreeRef.current;
    const tlEl = timelineRef.current;
    if (treeEl && tlEl) tlEl.scrollTop = treeEl.scrollTop;
    requestAnimationFrame(() => { isSyncingScroll.current = false; });
  }, []);

  const handleTimelineScroll = useCallback(() => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    const treeEl = taskTreeRef.current;
    const tlEl = timelineRef.current;
    if (treeEl && tlEl) treeEl.scrollTop = tlEl.scrollTop;
    requestAnimationFrame(() => { isSyncingScroll.current = false; });
  }, []);

  // Persist the WBS panel width (no state update — safe inside an effect)
  useEffect(() => {
    try { window.localStorage.setItem("dcos.gantt.labelW", String(labelW)); } catch { /* ignore */ }
  }, [labelW]);

  // Drag the divider between the WBS tree and the timeline
  const handleResizeStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = labelW;
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(LABEL_W_MAX, Math.max(LABEL_W_MIN, startW + (ev.clientX - startX)));
      setLabelW(next);
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
  }, [labelW]);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------
  const loadData = useCallback(() => {
    if (mode === "embedded" && propTasks) {
      setFetchedTasks(propTasks);
      setLoading(false);
      return;
    }
    if (!projectId) {
      setFetchedTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    Promise.all([
      supabase
        .from("wbs_tasks")
        .select(`
          id, task_code, task_name, discipline, wbs_node_id, owner_name,
          start_date, end_date, progress, status, delay_status, priority,
          dependency_task_ids, dependency_types, dependency_lag_days,
          is_milestone, constraint_type,
          baseline_start_date, baseline_finish_date,
          activity_type, actual_start_date, actual_finish_date, field_observation_notes
        `)
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true })
        .order("start_date", { ascending: true })
        .limit(500),
      supabase.from("wbs_nodes")
        .select("id, parent_id, wbs_code, wbs_name")
        .eq("project_id", projectId)
        .order("wbs_code", { ascending: true }),
      supabase.rpc("get_critical_path_tasks", { p_project_id: projectId }).then((r) => r.data),
      supabase.from("projects").select("data_date").eq("id", projectId).maybeSingle(),
    ]).then(([tRes, wRes, cpData, projRes]) => {
      if (tRes.error) toast.error(tRes.error.message);
      else setFetchedTasks((tRes.data || []) as unknown as GanttTask[]);
      if (wRes.data) setWbsNodes(wRes.data);
      if (Array.isArray(cpData)) {
        const cpRows = cpData as Array<
          Partial<CpmRow> & { id: string; total_float?: number | null }
        >;
        setCriticalIds(new Set(cpRows.map((r) => r.id)));
        setCpmMap(
          new Map(
            cpRows.map((r) => [
              r.id,
              {
                id: r.id,
                early_start: r.early_start ?? null,
                early_finish: r.early_finish ?? null,
                late_start: r.late_start ?? null,
                late_finish: r.late_finish ?? null,
                total_float_days: r.total_float_days ?? r.total_float ?? null,
              } satisfies CpmRow,
            ]),
          ),
        );
      }
      if (projRes.data?.data_date) setDataDate(projRes.data.data_date);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [supabase, projectId, mode, propTasks]);

  useEffect(() => {
    // Data-loading effect: loadData drives loading/error/data state for the chart.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  // Enrich tasks
  const tasks = useMemo<GanttTask[]>(() => {
    const withCpm = fetchedTasks.map((t) => {
      const cpm = cpmMap.get(t.id);
      return {
        ...t,
        dependency_lag_days: t.dependency_lag_days || [],
        is_critical: criticalIds.has(t.id),
        total_float: cpm?.total_float_days ?? null,
        early_start: cpm?.early_start ?? null,
        early_finish: cpm?.early_finish ?? null,
        late_start: cpm?.late_start ?? null,
        late_finish: cpm?.late_finish ?? null,
        free_float: null as number | null,
      };
    });

    // Free float = min(successor early_start − this early_finish − lag), clamped at 0.
    // With no successors it collapses to total float.
    const dayMs = 86_400_000;
    for (const t of withCpm) {
      if (!t.early_finish) { t.free_float = t.total_float; continue; }
      let ff: number | null = null;
      for (const s of withCpm) {
        const idx = s.dependency_task_ids?.indexOf(t.id) ?? -1;
        if (idx < 0 || !s.early_start) continue;
        const lag = Number(s.dependency_lag_days?.[idx] ?? 0) || 0;
        const gap =
          Math.round((new Date(s.early_start).getTime() - new Date(t.early_finish).getTime()) / dayMs) -
          1 -
          lag;
        ff = ff === null ? gap : Math.min(ff, gap);
      }
      t.free_float = ff === null ? t.total_float : Math.max(0, ff);
    }

    return withCpm;
  }, [fetchedTasks, criticalIds, cpmMap]);

  const projectName = selectedProject?.project_name || "";
  const projectCode = selectedProject?.project_code || "";

  // -----------------------------------------------------------------------
  // WBS tree & depth calculation
  // -----------------------------------------------------------------------
  // Augment WBS nodes: insert a virtual project root at the top
  const augmentedWbsNodes = useMemo<WbsNode[]>(() => {
    if (!projectName) return wbsNodes;
    return [
      { id: "__project__", parent_id: null, wbs_code: projectCode || "PROJ", wbs_name: projectName },
      ...wbsNodes.map((n) => (n.parent_id ? n : { ...n, parent_id: "__project__" })),
    ];
  }, [wbsNodes, projectName, projectCode]);

  const { groups, nodeDepthMap } = useMemo(() => {
    const nodeMap = new Map(augmentedWbsNodes.map((n) => [n.id, n]));
    const depthCache = new Map<string, number>();

    function getDepth(nodeId: string): number {
      if (depthCache.has(nodeId)) return depthCache.get(nodeId)!;
      const node = nodeMap.get(nodeId);
      if (!node || !node.parent_id) { depthCache.set(nodeId, 0); return 0; }
      const d = getDepth(node.parent_id) + 1;
      depthCache.set(nodeId, d);
      return d;
    }

    // Build parent→children map
    const childrenOfNode = new Map<string, string[]>();
    for (const node of augmentedWbsNodes) {
      if (node.parent_id) {
        const siblings = childrenOfNode.get(node.parent_id) || [];
        siblings.push(node.id);
        childrenOfNode.set(node.parent_id, siblings);
      }
    }

    const tasksByNode = new Map<string, GanttTask[]>();
    for (const t of tasks) {
      if (!t.wbs_node_id) continue;
      const list = tasksByNode.get(t.wbs_node_id) || [];
      list.push(t);
      tasksByNode.set(t.wbs_node_id, list);
    }

    // Collect ALL descendant tasks (recursive) for summary aggregation
    function getAllDescendantTasks(nodeId: string): GanttTask[] {
      const result: GanttTask[] = [];
      const children = childrenOfNode.get(nodeId) || [];
      for (const childId of children) {
        const childTasks = tasksByNode.get(childId) || [];
        result.push(...childTasks);
        result.push(...getAllDescendantTasks(childId));
      }
      return result;
    }

    const grps: GanttGroupRow[] = [];
    for (const node of augmentedWbsNodes) {
      const directTasks = tasksByNode.get(node.id) || [];
      const descendantTasks = getAllDescendantTasks(node.id);
      const allTasks = [...directTasks, ...descendantTasks];

      const startDates = allTasks.map((t) => t.start_date).filter(Boolean) as string[];
      const endDates = allTasks.map((t) => t.end_date).filter(Boolean) as string[];

      grps.push({
        id: node.id,
        type: "wbs_group",
        wbs_code: node.wbs_code,
        wbs_name: node.wbs_name,
        wbs_depth: getDepth(node.id),
        is_expanded: expandedNodes.has(node.id),
        children: directTasks.map((t) => t.id),
        start_date: startDates.length ? startDates.sort()[0] : null,
        end_date: endDates.length ? endDates.sort()[endDates.length - 1] : null,
        progress: allTasks.length
          ? Math.round(allTasks.reduce((s, t) => s + t.progress, 0) / allTasks.length)
          : 0,
        task_count: allTasks.length,
      });
    }

    return { groups: grps, nodeDepthMap: depthCache };
  }, [tasks, wbsNodes, expandedNodes]);

  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  // WBS tree root nodes
  const rootNodes = useMemo(
    () => buildWbsTree(augmentedWbsNodes, tasks, nodeDepthMap),
    [augmentedWbsNodes, tasks, nodeDepthMap],
  );

  // -----------------------------------------------------------------------
  // Unified display rows driving BOTH the tree panel and the timeline
  // -----------------------------------------------------------------------
  const displayRows = useMemo<GanttDisplayRow[]>(() => {
    const rows: GanttDisplayRow[] = [];
    const taskFilter = (t: GanttTask) =>
      !searchQuery ||
      t.task_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.task_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.owner_name?.toLowerCase().includes(searchQuery.toLowerCase());

    const groupMap = new Map(groups.map((g) => [g.id, g]));

    function walk(node: WbsTreeNode) {
      const group = groupMap.get(node.id);
      // Always show the node row (even with 0 tasks) so the tree is navigable
      if (group) {
        rows.push({ id: group.id, kind: "group", data: group, depth: node.depth });
      }
      if (!expandedNodes.has(node.id)) return;
      for (const child of node.children) walk(child);
      for (const t of node.tasks) {
        if (taskFilter(t)) rows.push({ id: t.id, kind: "task", data: t, depth: node.depth + 1 });
      }
    }

    for (const root of rootNodes) walk(root);

    // Ungrouped tasks (no wbs_node_id or pointing to a node not in our list)
    const wbsNodeIds = new Set(augmentedWbsNodes.map((n) => n.id));
    const ungroupedTasks = tasks.filter(
      (t) => (!t.wbs_node_id || !wbsNodeIds.has(t.wbs_node_id)) && taskFilter(t),
    );
    if (ungroupedTasks.length > 0) {
      for (const t of ungroupedTasks) {
        rows.push({ id: t.id, kind: "task", data: t, depth: 0 });
      }
    }

    return rows;
  }, [rootNodes, groups, expandedNodes, searchQuery, tasks, wbsNodes]);

  // -----------------------------------------------------------------------
  // Date range & zoom
  // -----------------------------------------------------------------------
  const dateRange = useMemo(() => computeDateRange(tasks), [tasks]);
  const totalDays = getTotalDays(dateRange.min, dateRange.max);
  const dayW = getZoomDayWidth(zoom) * zoomScale;
  const chartW = totalDays * dayW;
  const gridPx = Math.max(24, getHeaderTickDays(dayW) * dayW);

  const maxWbsLevel = useMemo(
    () => Math.max(0, ...Array.from(nodeDepthMap.values())) + 1,
    [nodeDepthMap],
  );

  const weightedProgress = useMemo(() => {
    let totalDuration = 0;
    let weighted = 0;
    for (const t of tasks) {
      if (!t.start_date || !t.end_date) continue;
      const dur = daysBetween(t.start_date, t.end_date);
      totalDuration += dur;
      weighted += dur * t.progress;
    }
    return totalDuration > 0 ? Math.round(weighted / totalDuration) : 0;
  }, [tasks]);

  const completedTaskCount = useMemo(
    () => tasks.filter((t) => t.status === "completed").length,
    [tasks],
  );

  const dependencyLinksCount = useMemo(
    () => tasks.reduce((sum, t) => sum + (t.dependency_task_ids?.length || 0), 0),
    [tasks],
  );

  // -----------------------------------------------------------------------
  // Row offset tracking for dependency lines
  // -----------------------------------------------------------------------
  const storeRowRef = useCallback((rowId: string, element: HTMLDivElement | null) => {
    if (element) {
      rowRefs.current.set(rowId, element);
    } else {
      rowRefs.current.delete(rowId);
    }
  }, []);

  const computeRowOffsets = useCallback(() => {
    const c = timelineRef.current;
    if (!c) return;
    const offsets = new Map<string, number>();
    const pr = c.getBoundingClientRect();
    for (const [id, el] of rowRefs.current.entries()) {
      const rr = el.getBoundingClientRect();
      offsets.set(id, rr.top - pr.top + c.scrollTop);
    }
    setRowOffsets(offsets);
  }, []);

  useEffect(() => {
    const c = timelineRef.current;
    if (!c) return;
    computeRowOffsets();
    const onScroll = () => computeRowOffsets();
    c.addEventListener("scroll", onScroll);
    return () => c.removeEventListener("scroll", onScroll);
  }, [computeRowOffsets, displayRows.length]);

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  const delayedCount = tasks.filter((t) => t.delay_status === "delayed").length;

  const handleToggleNode = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const handleFullscreenToggle = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandedNodes(new Set(augmentedWbsNodes.map((n) => n.id)));
    setLevelFilter("all");
  }, [augmentedWbsNodes]);

  const handleCollapseAll = useCallback(() => {
    setExpandedNodes(new Set());
    setLevelFilter("all");
  }, []);

  const handleLevelFilterChange = useCallback((level: number | "all") => {
    setLevelFilter(level);
    if (level === "all") {
      setExpandedNodes(new Set(augmentedWbsNodes.map((n) => n.id)));
      return;
    }
    const next = new Set<string>();
    for (const node of augmentedWbsNodes) {
      const depth = nodeDepthMap.get(node.id) ?? 0;
      if (depth < level - 1) next.add(node.id);
    }
    setExpandedNodes(next);
  }, [augmentedWbsNodes, nodeDepthMap]);

  const handleAutoScheduleToggle = useCallback(() => {
    setAutoScheduleActive((prev) => !prev);
  }, []);

  // Scale the timeline so the whole programme fits the visible width (no scroll)
  const handleFitToScreen = useCallback(() => {
    const el = timelineRef.current;
    if (!el || totalDays <= 0) return;
    // headroom for the scrollbar + trailing milestone / float labels
    const available = Math.max(240, el.clientWidth - 48);
    const targetDayW = Math.max(0.4, available / totalDays);
    const nextZoom: GanttZoom = targetDayW < 4 ? "month" : targetDayW < 14 ? "week" : "day";
    fitModeRef.current = true;
    setZoom(nextZoom);
    setZoomScale(targetDayW / getZoomDayWidth(nextZoom));
    requestAnimationFrame(() => { el.scrollLeft = 0; });
  }, [totalDays]);

  // User picked a zoom manually → stop auto-fitting on resize
  const handleZoomChange = useCallback((z: GanttZoom) => {
    fitModeRef.current = false;
    setZoom(z);
  }, []);
  const handleZoomScaleChange = useCallback((s: number) => {
    fitModeRef.current = false;
    setZoomScale(s);
  }, []);

  // Re-fit whenever the data (and therefore the timeline span) changes, unless
  // the user has taken over the zoom manually. Also covers the first render.
  useEffect(() => { didAutoFitRef.current = false; }, [projectId]);
  useEffect(() => {
    if (loading || projectLoading || totalDays <= 0 || displayRows.length === 0) return;
    if (didAutoFitRef.current && !fitModeRef.current) return;
    didAutoFitRef.current = true;
    const id = requestAnimationFrame(() => handleFitToScreen());
    return () => cancelAnimationFrame(id);
  }, [loading, projectLoading, totalDays, displayRows.length, handleFitToScreen]);

  // Keep it fitted when the window / panel resizes (until the user zooms)
  useEffect(() => {
    const el = timelineRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (!fitModeRef.current) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => handleFitToScreen());
    });
    ro.observe(el);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [handleFitToScreen]);

  const handleReschedule = useCallback(async (taskId: string, newStart: string, newEnd: string) => {
    const { error } = await supabase
      .from("wbs_tasks")
      .update({ start_date: newStart, end_date: newEnd })
      .eq("id", taskId);
    if (error) toast.error("Failed to reschedule: " + error.message);
    else {
      toast.success("Task rescheduled");
      setFetchedTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, start_date: newStart, end_date: newEnd } : t)),
      );
    }
  }, [supabase]);

  // -----------------------------------------------------------------------
  // Dependency links — drag a bar's link handle onto another task
  // -----------------------------------------------------------------------
  // Dependency connectors are only drawn for the *selected* task (click a bar).
  // Hovering / moving the mouse across tasks never reveals them.
  const highlightIds = useMemo(
    () => (selectedTaskId ? new Set([selectedTaskId]) : new Set<string>()),
    [selectedTaskId],
  );

  const handleStartLink = useCallback((fromId: string, e: ReactMouseEvent) => {
    setLinkDrag({ fromId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY });
  }, []);

  const createLink = useCallback(async (predId: string, succId: string) => {
    if (predId === succId) return;
    const succ = tasks.find((t) => t.id === succId);
    if (!succ) return;
    if ((succ.dependency_task_ids ?? []).includes(predId)) {
      toast.error("Those tasks are already linked");
      return;
    }
    if (wouldCreateCycle(predId, succId, tasks)) {
      toast.error("That link would create a circular dependency");
      return;
    }
    const { error } = await supabase
      .from("wbs_tasks")
      .update({
        dependency_task_ids: [...(succ.dependency_task_ids ?? []), predId],
        dependency_types: [...(succ.dependency_types ?? []), "fs"],
        dependency_lag_days: [...(succ.dependency_lag_days ?? []), 0],
      })
      .eq("id", succId);
    if (error) {
      toast.error("Failed to link: " + error.message);
      return;
    }
    toast.success("Dependency added (Finish-to-Start)");
    setShowDependencies(true); // so the new arrow is actually visible
    loadData();
  }, [tasks, supabase, loadData]);

  useEffect(() => {
    if (!linkDrag) return;
    const move = (e: MouseEvent) =>
      setLinkDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    const up = (e: MouseEvent) => {
      // Walk every element under the cursor (an overlay SVG may sit on top) and
      // take the first one that resolves to a task row.
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
      if (toId && toId !== fromId) void createLink(fromId, toId);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    document.body.style.cursor = "crosshair";
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
    };
  }, [linkDrag, createLink]);

  const editContext = useMemo(() => {
    if (!editLink) return null;
    const succ = tasks.find((t) => t.id === editLink.successorId);
    const predId = succ?.dependency_task_ids?.[editLink.index];
    const pred = predId ? tasks.find((t) => t.id === predId) : undefined;
    if (!succ || !pred) return null;
    return {
      successor: succ,
      predecessor: pred,
      type: (succ.dependency_types?.[editLink.index] || "fs").toLowerCase(),
      lag: Number(succ.dependency_lag_days?.[editLink.index] ?? 0) || 0,
    };
  }, [editLink, tasks]);

  const handleSaveLink = useCallback(async (type: string, lag: number) => {
    if (!editLink) return;
    const succ = tasks.find((t) => t.id === editLink.successorId);
    if (!succ) return;
    const types = [...(succ.dependency_types ?? [])];
    const lags = [...(succ.dependency_lag_days ?? [])];
    types[editLink.index] = type;
    lags[editLink.index] = lag;
    setSavingLink(true);
    const { error } = await supabase
      .from("wbs_tasks")
      .update({ dependency_types: types, dependency_lag_days: lags })
      .eq("id", succ.id);
    setSavingLink(false);
    if (error) {
      toast.error("Failed to save: " + error.message);
      return;
    }
    toast.success("Relation updated");
    setEditLink(null);
    loadData();
  }, [editLink, tasks, supabase, loadData]);

  const handleRemoveLink = useCallback(async () => {
    if (!editLink) return;
    const succ = tasks.find((t) => t.id === editLink.successorId);
    if (!succ) return;
    const ids = [...(succ.dependency_task_ids ?? [])];
    const types = [...(succ.dependency_types ?? [])];
    const lags = [...(succ.dependency_lag_days ?? [])];
    ids.splice(editLink.index, 1);
    types.splice(editLink.index, 1);
    lags.splice(editLink.index, 1);
    setSavingLink(true);
    const { error } = await supabase
      .from("wbs_tasks")
      .update({ dependency_task_ids: ids, dependency_types: types, dependency_lag_days: lags })
      .eq("id", succ.id);
    setSavingLink(false);
    if (error) {
      toast.error("Failed to remove: " + error.message);
      return;
    }
    toast.success("Link removed");
    setEditLink(null);
    loadData();
  }, [editLink, tasks, supabase, loadData]);

  const now = new Date();
  const todayX =
    now >= dateRange.min && now <= dateRange.max
      ? toX(now.toISOString().slice(0, 10), dateRange.min, dayW)
      : -1;
  const dataDateX = dataDate ? toX(dataDate, dateRange.min, dayW) : -1;

  const handleScrollToToday = useCallback(() => {
    const el = timelineRef.current;
    if (!el || todayX < 0) return;
    el.scrollLeft = Math.max(0, todayX - el.clientWidth / 2);
  }, [todayX]);

  // Guard: loading
  if (loading || projectLoading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Guard: no project
  if (mode === "full" && !projectId) {
    return (
      <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
        Select a project to view the Gantt chart.
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0 max-w-full flex-col", isFullscreen ? "fixed inset-0 z-50 bg-background" : "min-h-0 flex-1")}>
      {/* Toolbar */}
      <div className="shrink-0 px-2 pt-1 pb-2">
        {mode === "full" ? (
          <GanttCommandBar
            zoom={zoom}
            onZoomChange={handleZoomChange}
            zoomScale={zoomScale}
            onZoomScaleChange={handleZoomScaleChange}
            levelFilter={levelFilter}
            maxLevel={maxWbsLevel}
            onLevelFilterChange={handleLevelFilterChange}
            onExpandAll={handleExpandAll}
            onCollapseAll={handleCollapseAll}
            onToday={handleScrollToToday}
            onFitToScreen={handleFitToScreen}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showBaseline={showBaseline}
            onBaselineToggle={setShowBaseline}
            showDependencies={showDependencies}
            onShowDependenciesChange={setShowDependencies}
            isFullscreen={isFullscreen}
            onFullscreenToggle={handleFullscreenToggle}
            visibleRows={displayRows.length}
            weightedProgress={weightedProgress}
            completedTasks={completedTaskCount}
            totalTasks={tasks.length}
            dependencyLinksCount={dependencyLinksCount}
            highlightCritical={highlightCritical}
            onHighlightCriticalChange={setHighlightCritical}
            autoScheduleActive={autoScheduleActive}
            onAutoScheduleToggle={handleAutoScheduleToggle}
            rangeMin={dateRange.min}
            rangeMax={dateRange.max}
            totalDays={totalDays}
          />
        ) : (
          <GanttToolbar
            zoom={zoom}
            onZoomChange={handleZoomChange}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showBaseline={showBaseline}
            onBaselineToggle={setShowBaseline}
            showDependencies={showDependencies}
            onShowDependenciesChange={setShowDependencies}
            isFullscreen={isFullscreen}
            onFullscreenToggle={handleFullscreenToggle}
            taskCount={tasks.length}
            filteredCount={displayRows.length}
            highlightCritical={highlightCritical}
            onHighlightCriticalChange={setHighlightCritical}
            onFitToScreen={handleFitToScreen}
            onAddActivity={() => {}}
          />
        )}
      </div>

      {/* Main Gantt area */}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden px-2 pb-2">
        {/* Left: WBS Tree */}
        <div
          ref={taskTreeRef}
          onScroll={handleTaskTreeScroll}
          className="shrink-0 overflow-y-auto border border-border rounded-l-lg bg-card"
          style={{ width: labelW }}
        >
          <div
            className="sticky top-0 z-10 bg-muted/50 border-b border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
            style={{ height: HEADER_H }}
          >
            WBS
          </div>
          <GanttTaskTree
            displayRows={displayRows}
            expandedNodes={expandedNodes}
            onToggleNode={handleToggleNode}
            onSelectTask={(t) => setSelectedTaskId(t.id)}
            selectedTaskId={selectedTaskId}
          />
        </div>

        {/* Divider — drag to resize the WBS panel, double-click to reset */}
        <div
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize · double-click to reset"
          onMouseDown={handleResizeStart}
          onDoubleClick={() => setLabelW(LABEL_W)}
          className="group relative z-10 flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-border hover:bg-primary/40 transition-colors"
        >
          <span className="absolute inset-y-0 -left-1.5 -right-1.5" />
          <span className="h-8 w-0.5 rounded bg-muted-foreground/30 group-hover:bg-primary/60" />
        </div>

        {/* Right: Timeline */}
        <div
          ref={timelineRef}
          onScroll={handleTimelineScroll}
          className="min-w-0 flex-1 overflow-auto border border-l-0 border-border rounded-r-lg bg-card"
        >
          <div className="min-w-fit">
            <GanttHeader
              zoom={zoom}
              rangeMin={dateRange.min}
              rangeMax={dateRange.max}
              totalDays={totalDays}
              dayWidth={dayW}
              todayX={todayX}
              dataDateX={dataDateX}
            />

            <div className="relative" style={{ width: chartW }}>
              {/* Vertical gridlines aligned to the header date ticks */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage: `repeating-linear-gradient(to right, rgba(148,163,184,0.14) 0, rgba(148,163,184,0.14) 1px, transparent 1px, transparent ${gridPx}px)`,
                }}
              />

              {/* Dependency lines — only shown for the hovered / selected task */}
              <GanttDependencyLines
                tasks={displayRows.filter((r) => r.kind === "task").map((r) => (r.data as GanttTask))}
                taskMap={taskMap}
                rangeMin={dateRange.min}
                dayWidth={dayW}
                rowHeight={ROW_HEIGHT}
                rowOffsetMap={rowOffsets}
                containerWidth={chartW}
                highlightIds={highlightIds}
                showAll={showDependencies}
                onEditLink={(succId, index) => setEditLink({ successorId: succId, index })}
              />

              {/* Bars */}
              {displayRows.map((row) => {
                if (row.kind === "group") {
                  const group = row.data;
                  const es = group.start_date || dateRange.min.toISOString().slice(0, 10);
                  const ef = group.end_date || dateRange.max.toISOString().slice(0, 10);
                  const x = toX(es, dateRange.min, dayW);
                  const w = getBarWidth(es, ef, dayW);
                  return (
                    <div
                      key={row.id}
                      ref={(el) => storeRowRef(row.id, el)}
                      className="relative border-b border-border/30 bg-muted/5"
                      style={{ height: ROW_HEIGHT }}
                    >
                      {group.task_count > 0 && (
                        <GanttSummaryBar
                          label={group.wbs_code}
                          progress={group.progress}
                          taskCount={group.task_count}
                          left={x}
                          width={w}
                          dayWidth={dayW}
                        />
                      )}
                    </div>
                  );
                }

                const task = row.data as GanttTask;
                const es = task.start_date || task.baseline_start_date || dateRange.min.toISOString().slice(0, 10);
                const ef = task.end_date || task.baseline_finish_date || dateRange.max.toISOString().slice(0, 10);
                const x = toX(es, dateRange.min, dayW);
                const w = getBarWidth(es, ef, dayW);

                return (
                  <div
                    key={row.id}
                    ref={(el) => storeRowRef(row.id, el)}
                    data-gantt-task={task.id}
                    className="relative border-b border-border/30 transition-colors hover:bg-muted/10"
                    style={{ height: ROW_HEIGHT }}
                  >
                    {task.is_milestone ? (
                      <GanttMilestone
                        left={x}
                        name={task.task_name}
                        date={task.start_date || undefined}
                        onClick={() => setSelectedTaskId(task.id)}
                        onStartLink={(e) => handleStartLink(task.id, e)}
                      />
                    ) : (
                      <GanttBar
                        task={task}
                        left={x}
                        width={w}
                        dayWidth={dayW}
                        onClick={() => setSelectedTaskId(task.id)}
                        onReschedule={handleReschedule}
                        onStartLink={(e) => handleStartLink(task.id, e)}
                        zoom={zoom}
                        rangeMin={dateRange.min}
                      />
                    )}

                    {task.total_float !== null && task.is_milestone && (
                      <span
                        className={cn("absolute top-0 text-[9px] font-semibold px-0.5 rounded", task.total_float <= 0 ? "text-red-600" : "text-slate-400")}
                        style={{ left: x + dayW + 2 }}
                      >
                        F:{task.total_float}d
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Full-height schedule data-date line */}
              {dataDateX >= 0 && dataDateX <= chartW && dataDateX !== todayX && (
                <div
                  className="pointer-events-none absolute inset-y-0 z-20 border-l border-dashed border-slate-400"
                  style={{ left: dataDateX }}
                />
              )}

              {/* Full-height TODAY line */}
              {todayX >= 0 && todayX <= chartW && (
                <div
                  className="pointer-events-none absolute inset-y-0 z-20 border-l-2 border-dashed border-red-500"
                  style={{ left: todayX }}
                />
              )}

              {/* Empty state */}
              {displayRows.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-sm text-muted-foreground gap-2">
                  {searchQuery ? (
                    <>
                      <p>No tasks match &quot;{searchQuery}&quot;</p>
                      <button type="button" onClick={() => setSearchQuery("")} className="text-xs text-primary underline">Clear search</button>
                    </>
                  ) : (
                    <>
                      <p className="text-base font-medium">No tasks found</p>
                      <p className="text-xs">Add tasks to this project to see them in the Gantt chart.</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Legend — embedded mode only; full mode shows it in the command bar */}
      {mode !== "full" && (
        <div className="shrink-0 px-2 pb-2">
          <GanttLegend
            items={[
              { label: "On Track", color: "bg-green-500", active: true },
              { label: "Risk", color: "bg-amber-500", active: true },
              { label: "Delayed", color: "bg-red-500", active: true },
              { label: "Blocked", color: "bg-slate-400", active: true },
              { label: "Milestone", color: "bg-amber-400", active: true },
            ]}
            showBaseline={showBaseline}
            criticalCount={criticalIds.size}
            delayedCount={delayedCount}
          />
        </div>
      )}

      {/* Detail drawer */}
      {selectedTask && (
        <GanttTaskDetailDrawer
          key={selectedTask.id}
          task={selectedTask}
          allTasks={tasks}
          onClose={() => setSelectedTaskId(null)}
          onRefresh={loadData}
          onEditLink={(index) => setEditLink({ successorId: selectedTask.id, index })}
        />
      )}

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

