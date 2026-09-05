"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import type { TaskFloat } from "@/lib/planning/schedule-engine";
import { GanttBar } from "@/components/planning/gantt-bar";
import { GanttHeader } from "@/components/planning/gantt-header";
import { toGanttTask } from "@/components/planning/schedule-timeline";
import {
  computeDateRange,
  getBarWidth,
  getTotalDays,
  getZoomDayWidth,
  toX,
} from "@/components/planning/gantt-utils";
import { applyZoomPreset, DEFAULT_TIMESCALE, tierRowHeights } from "@/lib/planning/timescale";
import { ROW_HEIGHT, type SheetTask } from "@/components/planning/sheet-types";
import { cn } from "@/lib/utils";

interface WbsLookaheadTimelineProps {
  tasks: SheetTask[];
  float: Map<string, TaskFloat>;
}

/** Left-pane column widths (px) — task label columns paired with the Gantt bars. */
const LEFT_COL_WIDTHS = {
  code: 84,
  name: 200,
  discipline: 104,
  owner: 120,
  status: 108,
  delay: 88,
} as const;
const LEFT_WIDTH = Object.values(LEFT_COL_WIDTHS).reduce((a, b) => a + b, 0);

/** Status badge color mapping — shared with the print table's plain labels. */
export function statusBadge(status: string): string {
  const map: Record<string, string> = {
    open: "bg-slate-100 text-slate-600",
    in_progress: "bg-blue-50 text-blue-700",
    paused: "bg-amber-50 text-amber-700",
    blocked: "bg-red-50 text-red-700",
    review: "bg-violet-50 text-violet-700",
    submitted: "bg-cyan-50 text-cyan-700",
    completed: "bg-emerald-50 text-emerald-700",
    closed: "bg-emerald-100 text-emerald-800",
    rejected: "bg-rose-50 text-rose-700",
    cancelled: "bg-slate-100 text-slate-400",
  };
  return map[status] ?? "bg-slate-100 text-slate-600";
}

export function delayBadge(delay: string) {
  if (delay === "on_track") return null;
  const map: Record<string, string> = {
    risk: "bg-amber-50 text-amber-700",
    delayed: "bg-red-50 text-red-700",
    blocked: "bg-rose-50 text-rose-800",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
        map[delay] ?? "bg-slate-100 text-slate-600",
      )}
    >
      <AlertTriangle className="h-2.5 w-2.5" />
      {delay}
    </span>
  );
}

/**
 * Read-only Gantt-bar timeline for the Look-ahead planner — reuses the same
 * GanttHeader / GanttBar primitives as Planning ▸ Gantt Chart, sized for a
 * short 2-6 week window. No drag, no linking, no progress editing.
 */
export function WbsLookaheadTimeline({ tasks, float }: WbsLookaheadTimelineProps) {
  const dayWidth = getZoomDayWidth("day");
  const headerHeight = useMemo(
    () => tierRowHeights(applyZoomPreset(DEFAULT_TIMESCALE, "day")).total,
    [],
  );

  const ganttTasks = tasks.map((t) => toGanttTask(t, float.get(t.id)));
  const dateRange = computeDateRange(ganttTasks);
  const totalDays = getTotalDays(dateRange.min, dateRange.max);
  const chartW = Math.max(totalDays * dayWidth, dayWidth);
  const bodyHeight = Math.max(ROW_HEIGHT, tasks.length * ROW_HEIGHT);

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayX = toX(todayIso, dateRange.min, dayWidth);
  const showTodayMarker = todayX >= 0 && todayX <= chartW;

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">
        No tasks to plot on the timeline.
      </div>
    );
  }

  return (
    <div className="max-h-[560px] overflow-auto rounded-xl border border-slate-200 shadow-sm">
      <div className="flex" style={{ width: LEFT_WIDTH + chartW }}>
        {/* Left: task label columns */}
        <div
          className="sticky left-0 z-10 flex shrink-0 flex-col border-r border-slate-200 bg-background"
          style={{ width: LEFT_WIDTH }}
        >
          <div
            className="sticky top-0 z-20 flex items-center border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500"
            style={{ height: headerHeight }}
          >
            <div style={{ width: LEFT_COL_WIDTHS.code }} className="px-2">Code</div>
            <div style={{ width: LEFT_COL_WIDTHS.name }} className="px-2">Task</div>
            <div style={{ width: LEFT_COL_WIDTHS.discipline }} className="px-2">Discipline</div>
            <div style={{ width: LEFT_COL_WIDTHS.owner }} className="px-2">Owner</div>
            <div style={{ width: LEFT_COL_WIDTHS.status }} className="px-2 text-center">Status</div>
            <div style={{ width: LEFT_COL_WIDTHS.delay }} className="px-2 text-center">Delay</div>
          </div>

          {tasks.map((t) => {
            const isOverdue = t.delay_status === "delayed" || t.delay_status === "blocked";
            return (
              <div
                key={t.id}
                className={cn(
                  "flex items-center border-b border-slate-100 text-xs last:border-0",
                  isOverdue && "bg-red-50/30",
                )}
                style={{ height: ROW_HEIGHT }}
              >
                <div
                  style={{ width: LEFT_COL_WIDTHS.code }}
                  className="truncate px-2 font-mono font-medium text-slate-700"
                >
                  {t.task_code}
                </div>
                <div
                  style={{ width: LEFT_COL_WIDTHS.name }}
                  className="truncate px-2 font-medium text-slate-800"
                  title={t.task_name}
                >
                  {t.task_name}
                </div>
                <div style={{ width: LEFT_COL_WIDTHS.discipline }} className="truncate px-2 text-slate-500">
                  {t.discipline ?? "—"}
                </div>
                <div style={{ width: LEFT_COL_WIDTHS.owner }} className="truncate px-2 text-slate-600">
                  {t.owner_name ?? <span className="text-slate-300">Unassigned</span>}
                </div>
                <div style={{ width: LEFT_COL_WIDTHS.status }} className="flex justify-center px-2">
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", statusBadge(t.status))}>
                    {t.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div style={{ width: LEFT_COL_WIDTHS.delay }} className="flex justify-center px-2">
                  {delayBadge(t.delay_status ?? "on_track") ?? <span className="text-slate-300">—</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Gantt-bar timeline */}
        <div className="flex flex-col" style={{ width: chartW }}>
          <GanttHeader
            zoom="day"
            rangeMin={dateRange.min}
            rangeMax={dateRange.max}
            totalDays={totalDays}
            dayWidth={dayWidth}
            todayX={showTodayMarker ? todayX : -1}
          />
          <div className="relative" style={{ width: chartW, height: bodyHeight }}>
            {tasks.map((t, i) => {
              const g = ganttTasks[i];
              const es = t.start_date ?? dateRange.min.toISOString().slice(0, 10);
              const ef = t.end_date ?? es;
              const x = toX(es, dateRange.min, dayWidth);
              const w = getBarWidth(es, ef, dayWidth);
              return (
                <div
                  key={t.id}
                  className="absolute inset-x-0 border-b border-slate-100"
                  style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}
                >
                  <GanttBar task={g} left={x} width={w} dayWidth={dayWidth} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
