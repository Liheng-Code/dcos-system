"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useProject } from "@/components/dashboard/project-context";
import { cn } from "@/lib/utils";

import type { GanttZoom, GanttTask, GanttGroupRow, ScheduleLevel } from "./gantt-types";
import { DAY_W, ROW_HEIGHT, HEADER_H, LABEL_W } from "./gantt-types";
import {
  computeDateRange,
  getTotalDays,
  toX,
  getBarWidth,
  getZoomDayWidth,
} from "./gantt-utils";
import { getScheduleLevelConfig, getLevelZoom, showSummaryBars, isLookaheadLevel, isPortfolioLevel } from "./schedule-levels";

import { GanttToolbar } from "./gantt-toolbar";
import { GanttHeader } from "./gantt-header";
import { GanttBar } from "./gantt-bar";
import { GanttMilestone } from "./gantt-milestone";
import { GanttTaskTree } from "./gantt-task-tree";
import { GanttDependencyLines } from "./gantt-dependency-lines";
import { GanttLegend } from "./gantt-legend";
import { GanttTaskDetailDrawer } from "./gantt-task-detail-drawer";
import { PortfolioGantt } from "./portfolio-gantt";
import { LookaheadGantt } from "./lookahead-gantt";

interface GanttViewProps {
  projectId?: string;
  mode?: "full" | "embedded";
  tasks?: import("./gantt-types").GanttTask[];
  scheduleLevel?: ScheduleLevel;
  onScheduleLevelChange?: (level: ScheduleLevel) => void;
}

export function GanttView({
  projectId: propProjectId,
  mode = "full",
  tasks: propTasks,
  scheduleLevel: propScheduleLevel,
  onScheduleLevelChange,
}: GanttViewProps) {
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId, loading: projectLoading } = useProject();
  const projectId = propProjectId || selectedProjectId;

  const effectiveLevel = propScheduleLevel ?? (propTasks ? undefined : 3) as any;
  const levelConfig = effectiveLevel ? getScheduleLevelConfig(effectiveLevel) : null;

  const [fetchedTasks, setFetchedTasks] = useState<GanttTask[]>([]);
  const [wbsNodes, setWbsNodes] = useState<{ id: string; parent_id: string | null; wbs_code: string; wbs_name: string }[]>([]);
  const [criticalIds, setCriticalIds] = useState<Set<string>>(new Set());
  const [floatMap, setFloatMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(mode === "full");

  const [zoom, setZoom] = useState<GanttZoom>(levelConfig?.defaultZoom ?? "week");
  const [searchQuery, setSearchQuery] = useState("");
  const [showBaseline, setShowBaseline] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [rowOffsets, setRowOffsets] = useState<Map<string, number>>(new Map());

  const timelineRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Sync zoom when schedule level changes
  useEffect(() => {
    if (levelConfig) {
      setZoom(levelConfig.defaultZoom);
    }
  }, [propScheduleLevel]);

  // Fetch data — filter by schedule_level if specified
  useEffect(() => {
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

    const tasksQuery = supabase
      .from("wbs_tasks")
      .select(`
        id, task_code, task_name, discipline, wbs_node_id, owner_name,
        start_date, end_date, progress, status, delay_status, priority,
        dependency_task_ids, dependency_types, dependency_lag_days,
        is_milestone, constraint_type,
        baseline_start_date, baseline_finish_date, schedule_level
      `)
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true })
      .order("start_date", { ascending: true })
      .limit(500);

    if (effectiveLevel) {
      tasksQuery.eq("schedule_level", effectiveLevel);
    }

    Promise.all([
      tasksQuery,
      supabase.from("wbs_nodes")
        .select("id, parent_id, wbs_code, wbs_name, node_type, is_summary, schedule_level")
        .eq("project_id", projectId)
        .order("wbs_code", { ascending: true }),
      supabase.rpc("get_critical_path_tasks", { p_project_id: projectId }).then((r) => r.data),
    ]).then(([tRes, wRes, cpData]) => {
      if (tRes.error) toast.error(tRes.error.message);
      else setFetchedTasks((tRes.data || []) as unknown as GanttTask[]);
      if (wRes.data) setWbsNodes(wRes.data);
      if (Array.isArray(cpData)) {
        setCriticalIds(new Set(cpData.map((r: any) => r.id)));
        setFloatMap(new Map(cpData.map((r: any) => [r.id, r.total_float_days as number])));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [supabase, projectId, mode, propTasks, effectiveLevel]);

  // Enrich tasks
  const tasks = useMemo<GanttTask[]>(() => {
    return fetchedTasks.map((t) => ({
      ...t,
      dependency_lag_days: (t as any).dependency_lag_days || [],
      is_critical: criticalIds.has(t.id),
      total_float: floatMap.get(t.id) ?? null,
      schedule_level: (t as any).schedule_level ?? effectiveLevel ?? 3,
    }));
  }, [fetchedTasks, criticalIds, floatMap, effectiveLevel]);

  // Build WBS groups
  const { groups, taskMap } = useMemo(() => {
    const m = new Map(tasks.map((t) => [t.id, t]));

    const nodeMap = new Map(wbsNodes.map((n) => [n.id, n]));
    const nodeDepth = new Map<string, number>();

    function getDepth(nodeId: string): number {
      if (nodeDepth.has(nodeId)) return nodeDepth.get(nodeId)!;
      const node = nodeMap.get(nodeId);
      if (!node || !node.parent_id) {
        nodeDepth.set(nodeId, 0);
        return 0;
      }
      const d = getDepth(node.parent_id) + 1;
      nodeDepth.set(nodeId, d);
      return d;
    }

    const tasksWithDepth = tasks.map((t) => {
      const depth = t.wbs_node_id ? getDepth(t.wbs_node_id) : 0;
      return { ...t, wbs_depth: depth };
    });
    m.clear();
    tasksWithDepth.forEach((t) => m.set(t.id, t));

    const tasksByNode = new Map<string, GanttTask[]>();
    for (const t of tasksWithDepth) {
      const list = tasksByNode.get(t.wbs_node_id) || [];
      list.push(t);
      tasksByNode.set(t.wbs_node_id, list);
    }

    const grps: GanttGroupRow[] = [];
    for (const node of wbsNodes) {
      const nodeTasks = tasksByNode.get(node.id);
      if (!nodeTasks || nodeTasks.length === 0) continue;

      const startDates = nodeTasks.map((t) => t.start_date).filter(Boolean) as string[];
      const endDates = nodeTasks.map((t) => t.end_date).filter(Boolean) as string[];

      grps.push({
        id: node.id,
        type: "wbs_group",
        wbs_code: node.wbs_code,
        wbs_name: node.wbs_name,
        wbs_depth: getDepth(node.id),
        is_expanded: expandedGroups.has(node.id),
        children: nodeTasks.map((t) => t.id),
        start_date: startDates.length ? startDates.sort()[0] : null,
        end_date: endDates.length ? endDates.sort()[endDates.length - 1] : null,
        progress: nodeTasks.length
          ? Math.round(nodeTasks.reduce((s, t) => s + t.progress, 0) / nodeTasks.length)
          : 0,
        task_count: nodeTasks.length,
      });
    }

    return { groups: grps, taskMap: m };
  }, [tasks, wbsNodes, expandedGroups]);

  // Date range
  const dateRange = useMemo(() => computeDateRange(tasks), [tasks]);
  const totalDays = getTotalDays(dateRange.min, dateRange.max);
  const dayW = getZoomDayWidth(zoom);
  const chartW = totalDays * dayW;

  // Filter by search
  const filteredTasks = useMemo(() => {
    if (!searchQuery) return tasks;
    const q = searchQuery.toLowerCase();
    return tasks.filter(
      (t) =>
        t.task_name.toLowerCase().includes(q) ||
        t.task_code.toLowerCase().includes(q) ||
        t.owner_name?.toLowerCase().includes(q),
    );
  }, [tasks, searchQuery]);

  const visibleTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of filteredTasks) {
      const group = groups.find((g) => g.children.includes(t.id));
      if (group && !expandedGroups.has(group.id)) continue;
      ids.add(t.id);
    }
    return ids;
  }, [filteredTasks, groups, expandedGroups]);

  const visibleTasks = useMemo(
    () => filteredTasks.filter((t) => visibleTaskIds.has(t.id)),
    [filteredTasks, visibleTaskIds],
  );

  // Row offset tracking for dependency lines
  const updateRowOffset = useCallback((taskId: string, element: HTMLDivElement | null) => {
    if (element) {
      rowRefs.current.set(taskId, element);
      const parent = timelineRef.current;
      if (parent) {
        const parentRect = parent.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        setRowOffsets((prev) => {
          const next = new Map(prev);
          next.set(taskId, rect.top - parentRect.top + parent.scrollTop);
          return next;
        });
      }
    }
  }, []);

  useEffect(() => {
    const container = timelineRef.current;
    if (!container) return;
    const handleScroll = () => {
      const newOffsets = new Map<string, number>();
      const parentRect = container.getBoundingClientRect();
      for (const [id, el] of rowRefs.current.entries()) {
        const rect = el.getBoundingClientRect();
        newOffsets.set(id, rect.top - parentRect.top + container.scrollTop);
      }
      setRowOffsets(newOffsets);
    };
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  const delayedCount = tasks.filter((t) => t.delay_status === "delayed").length;

  const handleToggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const handleFullscreenToggle = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const now = new Date();
  const todayX = now >= dateRange.min && now <= dateRange.max
    ? toX(now.toISOString().slice(0, 10), dateRange.min, dayW)
    : -1;

  if (loading || projectLoading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (mode === "full" && !projectId) {
    return (
      <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
        Select a project to view the Gantt chart.
      </div>
    );
  }

  if (effectiveLevel === 1) {
    return <PortfolioGantt scheduleLevel={1} />;
  }

  if (effectiveLevel === 5) {
    return <LookaheadGantt projectId={projectId} />;
  }

  return (
    <div className={cn("flex flex-col", isFullscreen ? "fixed inset-0 z-50 bg-background" : "")}>
      <div className="shrink-0 px-4 pt-3 pb-2">
        <GanttToolbar
          zoom={zoom}
          onZoomChange={setZoom}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          showBaseline={showBaseline}
          onBaselineToggle={setShowBaseline}
          isFullscreen={isFullscreen}
          onFullscreenToggle={handleFullscreenToggle}
          taskCount={tasks.length}
          filteredCount={filteredTasks.length}
          scheduleLevel={effectiveLevel}
          onScheduleLevelChange={onScheduleLevelChange}
          levelLabel={levelConfig?.shortLabel}
        />
      </div>

      <div className="flex flex-1 overflow-hidden px-4 pb-3">
        <div
          className="shrink-0 overflow-y-auto border border-border rounded-l-lg bg-card"
          style={{ width: LABEL_W }}
        >
          <div
            className="sticky top-0 z-10 bg-muted/50 border-b border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
            style={{ height: HEADER_H }}
          >
            {levelConfig?.shortLabel ?? "Task"}
          </div>
          <GanttTaskTree
            tasks={tasks}
            groups={groups}
            expandedGroups={expandedGroups}
            onToggleGroup={handleToggleGroup}
            onSelectTask={(t) => setSelectedTaskId(t.id)}
            selectedTaskId={selectedTaskId}
            searchQuery={searchQuery}
          />
        </div>

        <div
          ref={timelineRef}
          className="flex-1 overflow-auto border border-l-0 border-border rounded-r-lg bg-card"
        >
          <div className="min-w-fit">
            <GanttHeader
              zoom={zoom}
              rangeMin={dateRange.min}
              rangeMax={dateRange.max}
              totalDays={totalDays}
            />

            <div className="relative" style={{ width: chartW }}>
              <GanttDependencyLines
                tasks={visibleTasks}
                taskMap={taskMap}
                rangeMin={dateRange.min}
                dayWidth={dayW}
                rowHeight={ROW_HEIGHT}
                rowOffsetMap={rowOffsets}
                containerWidth={chartW}
              />

              {visibleTasks.map((task) => {
                const es = task.start_date || task.baseline_start_date || dateRange.min.toISOString().slice(0, 10);
                const ef = task.end_date || task.baseline_finish_date || dateRange.max.toISOString().slice(0, 10);
                const x = toX(es, dateRange.min, dayW);
                const w = getBarWidth(es, ef, dayW);

                const isSummaryLevel = showSummaryBars(effectiveLevel ?? 3) &&
                  groups.some((g) => g.children.length > 0 && g.children.includes(task.id));

                return (
                  <div
                    key={task.id}
                    ref={(el) => updateRowOffset(task.id, el)}
                    className={cn(
                      "relative border-b border-border/30 transition-colors",
                      isSummaryLevel ? "bg-muted/5" : "hover:bg-muted/10",
                    )}
                    style={{ height: ROW_HEIGHT }}
                  >
                    {todayX >= 0 && todayX <= chartW && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-red-400 z-10 pointer-events-none"
                        style={{ left: todayX }}
                      >
                        <span className="absolute top-0 left-1 text-[8px] font-semibold text-red-400 whitespace-nowrap">
                          Today
                        </span>
                      </div>
                    )}

                    {showBaseline && task.baseline_start_date && task.baseline_finish_date && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-slate-300 border border-dashed border-slate-400 opacity-50"
                        style={{
                          left: toX(task.baseline_start_date, dateRange.min, dayW),
                          width: getBarWidth(task.baseline_start_date, task.baseline_finish_date, dayW),
                        }}
                      />
                    )}

                    {task.is_milestone ? (
                      <GanttMilestone
                        left={x}
                        onClick={() => setSelectedTaskId(task.id)}
                      />
                    ) : isSummaryLevel ? (
                      <GanttSummaryBar
                        task={task}
                        left={x}
                        width={w}
                        dayWidth={dayW}
                        onClick={() => setSelectedTaskId(task.id)}
                        group={groups.find((g) => g.children.includes(task.id))}
                      />
                    ) : (
                      <GanttBar
                        task={task}
                        left={x}
                        width={w}
                        dayWidth={dayW}
                        onClick={() => setSelectedTaskId(task.id)}
                      />
                    )}

                    {task.total_float !== null && task.is_milestone && (
                      <span
                        className={cn(
                          "absolute top-0 text-[9px] font-semibold px-0.5 rounded",
                          task.total_float <= 0 ? "text-red-600" : "text-slate-400",
                        )}
                        style={{ left: x + dayW + 2 }}
                      >
                        F:{task.total_float}d
                      </span>
                    )}
                  </div>
                );
              })}

              {visibleTasks.length === 0 && (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                  {searchQuery ? "No tasks match your search" : "No tasks at this schedule level"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 px-4 pb-3">
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

      {selectedTask && (
        <GanttTaskDetailDrawer
          task={selectedTask}
          allTasks={tasks}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  );
}

function GanttSummaryBar({
  task,
  left,
  width,
  dayWidth,
  onClick,
  group,
}: {
  task: GanttTask;
  left: number;
  width: number;
  dayWidth: number;
  onClick?: () => void;
  group?: GanttGroupRow;
}) {
  const minWidth = Math.max(dayWidth, width);

  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 cursor-pointer group/bar"
      style={{ left, width: minWidth, height: 18 }}
      onClick={onClick}
    >
      <div className="relative h-full w-full rounded-full bg-slate-700/70 shadow-sm">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-slate-500/40"
          style={{ width: `${task.progress}%`, minWidth: task.progress > 0 ? 4 : 0 }}
        />
        <span className="absolute inset-0 flex items-center px-2 text-[9px] font-semibold text-white/90 leading-none truncate">
          {task.progress}% · {group?.task_count ?? 0} tasks
        </span>
      </div>
    </div>
  );
}
