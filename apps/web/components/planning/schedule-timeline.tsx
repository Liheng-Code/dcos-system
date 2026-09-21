"use client";

import { useMemo } from "react";
import { Lock } from "lucide-react";
import type { TaskFloat } from "@/lib/planning/schedule-engine";
import { cn } from "@/lib/utils";
import { GanttBar, type GanttGhostRef } from "./gantt-bar";
import { GanttProgressLine, type ProgressLineStyle } from "./gantt-progress-line";
import type { GanttBarStyleSettings } from "@/lib/planning/gantt-bar-style";
import { GanttDependencyLines } from "./gantt-dependency-lines";
import { GanttHeader } from "./gantt-header";
import { GanttMilestone } from "./gantt-milestone";
import { GanttSummaryBar } from "./gantt-summary-bar";
import type { GanttTask, GanttZoom } from "./gantt-types";
import { getBarWidth, toX } from "./gantt-utils";
import { isWorkingDay, type WorkCalendar } from "@/lib/planning/work-calendar";
import { unitApproxDays, type TimescaleConfig } from "@/lib/planning/timescale";
import type { SheetTask } from "./sheet-types";
import type { VisibleRow } from "./sheet-utils";

const DAY_MS = 86_400_000;

/**
 * Adapts a grid task row onto the shape the existing Gantt primitives expect.
 * `total_float` / `is_critical` come from the client scheduling engine, not the
 * calendar-day `get_critical_path_tasks()` RPC.
 */
export function toGanttTask(t: SheetTask, f?: TaskFloat): GanttTask {
  return {
    id: t.id,
    task_code: t.task_code,
    task_name: t.task_name,
    discipline: null,
    wbs_node_id: t.wbs_node_id,
    wbs_name: "",
    wbs_depth: 0,
    parent_wbs_node_id: null,
    start_date: t.start_date,
    end_date: t.end_date,
    progress: t.progress ?? 0,
    status: t.status,
    delay_status: t.delay_status ?? "on_track",
    priority: "medium",
    owner_name: null,
    dependency_task_ids: t.dependency_task_ids ?? [],
    dependency_types: t.dependency_types ?? [],
    dependency_lag_days: t.dependency_lag_days ?? [],
    is_milestone: t.is_milestone ?? false,
    constraint_type: t.constraint_type,
    baseline_start_date: t.baseline_start_date,
    baseline_finish_date: t.baseline_finish_date,
    is_critical: f?.critical ?? false,
    is_near_critical: f?.nearCritical ?? false,
    total_float: f?.totalFloat ?? null,
    free_float: f?.freeFloat ?? null,
  };
}

interface ScheduleTimelineProps {
  visibleRows: VisibleRow[];
  rowHeight: number;
  headerHeight: number;
  zoom: GanttZoom;
  /** MS-Project-style timescale — drives the multi-tier header + non-working shading. */
  timescale: TimescaleConfig;
  /** Project work calendar — for non-working-time shading. */
  calendar: WorkCalendar;
  dayWidth: number;
  rangeMin: Date;
  rangeMax: Date;
  totalDays: number;
  float: Map<string, TaskFloat>;
  /** Tasks under a locked WBS backbone — bar can't be dragged / linked. */
  lockedTaskIds: Set<string>;
  /**
   * Per-task dates for the reference ghost bar — the active Baseline by
   * default, or any Internal/External schedule revision the user picks in
   * the toolbar. `null` = no reference bar drawn.
   */
  referenceDates: Map<string, { start: string | null; end: string | null }> | null;
  /** Tooltip label for the reference ghost bar (e.g. "Baseline", "Internal Schedule — Rev 2"). */
  referenceLabel: string;
  /** Second comparison overlay ("Compare B") — same shape as `referenceDates`. `null` = none. */
  compareDates: Map<string, { start: string | null; end: string | null }> | null;
  compareLabel: string;
  /** Viewing a saved revision — disable every bar interaction (drag / link / wheel). */
  readOnly?: boolean;
  showDependencies: boolean;
  /** Show the FS/SS/FF/SF text badge on each dependency link. */
  showLinkLabels?: boolean;
  /** Show the critical-path red highlight (bar color + float badge). */
  showCritical: boolean;
  /** Every selected task id (multi-select). */
  selectedTaskIds: Set<string>;
  todayX: number;
  dataDateX: number;
  onSelectRow: (
    rowId: string,
    mods?: { additive?: boolean; range?: boolean },
  ) => void;
  onReschedule: (taskId: string, start: string, finish: string) => void;
  onStartLink: (taskId: string, e: React.MouseEvent) => void;
  onEditLink: (succId: string, index: number) => void;
  /** Mouse-wheel over a bar nudges % complete. */
  onSetProgress: (taskId: string, pct: number) => void;
  /** Double-clicking the timescale header opens the Timescale dialog (MS Project). */
  onOpenTimescale: () => void;
  /** Formats a date for the bar tooltip per the user's date-format preference. Defaults to gantt-utils' formatDate. */
  formatDate?: (iso: string | null | undefined) => string;
  showProgressLine?: boolean;
  progressLineDate?: string;
  progressLineStyle?: ProgressLineStyle;
  onEditProgressLine?: () => void;
  barStyle?: GanttBarStyleSettings;
  /** Double-clicking a task bar opens the "Format Bar" dialog (MS-Project style). */
  onFormatBar?: () => void;
  /** Show the total-float label above each bar. Defaults to on. */
  showFloat?: boolean;
}

export function ScheduleTimeline({
  visibleRows,
  rowHeight,
  headerHeight,
  zoom,
  timescale,
  calendar,
  dayWidth,
  rangeMin,
  rangeMax,
  totalDays,
  float,
  lockedTaskIds,
  referenceDates,
  referenceLabel,
  compareDates,
  compareLabel,
  readOnly = false,
  showDependencies,
  showLinkLabels = true,
  showCritical,
  selectedTaskIds,
  todayX,
  dataDateX,
  onSelectRow,
  onReschedule,
  onStartLink,
  onEditLink,
  onSetProgress,
  onOpenTimescale,
  formatDate,
  showProgressLine = false,
  progressLineDate,
  progressLineStyle,
  onEditProgressLine,
  barStyle,
  onFormatBar,
  showFloat = true,
}: ScheduleTimelineProps) {
  const chartW = Math.max(totalDays * dayWidth, 1);
  const gridPx = Math.max(
    24,
    unitApproxDays(timescale.tiers.bottom.unit) *
      Math.max(1, timescale.tiers.bottom.count) *
      dayWidth,
  );
  const bodyHeight = Math.max(rowHeight, visibleRows.length * rowHeight);

  const minISO = rangeMin.toISOString().slice(0, 10);
  const maxISO = rangeMax.toISOString().slice(0, 10);

  // Non-working-time shading — coalesce consecutive non-working days into spans.
  const nonworkingSpans = useMemo(() => {
    if (timescale.nonworking.draw === "none") return [];
    const spans: { left: number; width: number }[] = [];
    let runStart: number | null = null;
    for (let d = 0; d <= totalDays; d += 1) {
      const iso = new Date(rangeMin.getTime() + d * DAY_MS).toISOString().slice(0, 10);
      const off = !isWorkingDay(calendar, iso);
      if (off && runStart === null) runStart = d;
      else if (!off && runStart !== null) {
        spans.push({ left: runStart * dayWidth, width: (d - runStart) * dayWidth });
        runStart = null;
      }
    }
    if (runStart !== null) {
      spans.push({ left: runStart * dayWidth, width: (totalDays + 1 - runStart) * dayWidth });
    }
    return spans;
  }, [timescale.nonworking.draw, rangeMin, totalDays, dayWidth, calendar]);

  /**
   * Rows are laid out at a fixed `index * rowHeight`, so dependency-line
   * geometry is exact — no DOM measuring, no ResizeObserver.
   */
  const { ganttTasks, taskMap, rowOffsets } = useMemo(() => {
    const list: GanttTask[] = [];
    const map = new Map<string, GanttTask>();
    const offsets = new Map<string, number>();
    visibleRows.forEach((vr, i) => {
      if (vr.row.kind !== "task") return;
      const g = toGanttTask(vr.row.task, float.get(vr.row.task.id));
      const ref = referenceDates?.get(g.id);
      g.baseline_start_date = ref?.start ?? null;
      g.baseline_finish_date = ref?.end ?? null;
      list.push(g);
      map.set(g.id, g);
      offsets.set(g.id, i * rowHeight);
    });
    return { ganttTasks: list, taskMap: map, rowOffsets: offsets };
  }, [visibleRows, float, rowHeight, referenceDates]);

  const highlightIds = useMemo(
    () => (selectedTaskIds.size ? selectedTaskIds : new Set<string>()),
    [selectedTaskIds],
  );

  return (
    <div className="min-w-fit">
      {/*
        The header must be `sticky` on THIS element, not on GanttHeader's own
        root: a sticky child only sticks within its parent's box, so wrapping it
        in a plain fixed-height div would let it scroll away. Pinning the
        wrapper also guarantees the height matches the grid header exactly —
        if the two diverge, every row is offset.
      */}
      <div
        className="sticky top-0 z-20 bg-background"
        style={{ height: headerHeight }}
        onDoubleClick={onOpenTimescale}
        title="Double-click to change the timescale"
      >
        <GanttHeader
          config={timescale}
          zoom={zoom}
          rangeMin={rangeMin}
          rangeMax={rangeMax}
          totalDays={totalDays}
          dayWidth={dayWidth}
          todayX={todayX}
          dataDateX={dataDateX}
        />
      </div>

      <div className="relative" style={{ width: chartW, height: bodyHeight }}>
        {/* Vertical gridlines aligned to the bottom timescale tier */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `repeating-linear-gradient(to right, rgba(148,163,184,0.14) 0, rgba(148,163,184,0.14) 1px, transparent 1px, transparent ${gridPx}px)`,
          }}
        />

        {/* Non-working-time shading (weekends + calendar holidays) */}
        {timescale.nonworking.draw !== "none" && (
          <div
            className={cn(
              "pointer-events-none absolute inset-0",
              timescale.nonworking.draw === "front" && "z-10",
            )}
          >
            {nonworkingSpans.map((s, i) => (
              <div
                key={i}
                className="absolute inset-y-0"
                style={{
                  left: s.left,
                  width: s.width,
                  background: timescale.nonworking.color,
                  opacity: timescale.nonworking.draw === "front" ? 0.32 : 0.55,
                }}
              />
            ))}
          </div>
        )}

        <GanttDependencyLines
          tasks={ganttTasks}
          taskMap={taskMap}
          rangeMin={rangeMin}
          dayWidth={dayWidth}
          rowHeight={rowHeight}
          rowOffsetMap={rowOffsets}
          containerWidth={chartW}
          highlightIds={highlightIds}
          showAll={showDependencies}
          visible={showDependencies}
          showLabels={showLinkLabels}
          onEditLink={onEditLink}
        />

        {visibleRows.map((vr, i) => {
          const top = i * rowHeight;

          if (vr.row.kind === "node") {
            const { rollup, node } = vr.row;
            const es = rollup.start ?? minISO;
            const ef = rollup.end ?? maxISO;
            return (
              <div
                key={vr.row.id}
                onMouseDown={(e) =>
                  onSelectRow(vr.row.id, {
                    additive: e.ctrlKey || e.metaKey,
                    range: e.shiftKey,
                  })
                }
                className="absolute inset-x-0 border-b border-border/30 bg-muted/20"
                style={{ top, height: rowHeight }}
              >
                {rollup.taskCount > 0 && rollup.start && rollup.end && (
                  <GanttSummaryBar
                    label={node.wbs_code}
                    progress={rollup.progress}
                    taskCount={rollup.taskCount}
                    left={toX(es, rangeMin, dayWidth)}
                    width={getBarWidth(es, ef, dayWidth)}
                    dayWidth={dayWidth}
                    height={Math.min(18, rowHeight - 12)}
                    depth={vr.depth}
                  />
                )}
              </div>
            );
          }

          const task = vr.row.task;
          const g = taskMap.get(task.id);
          if (!g) return null;
          const es = task.start_date ?? task.baseline_start_date ?? minISO;
          const ef = task.end_date ?? task.baseline_finish_date ?? es;
          const x = toX(es, rangeMin, dayWidth);
          const w = getBarWidth(es, ef, dayWidth);
          // Comparison overlays — each drawn at its own schedule's start/length
          // (not stretched over the live bar). Compare A = referenceDates,
          // Compare B = compareDates.
          const ghostRefs: GanttGhostRef[] = [];
          for (const [src, label, tone] of [
            [referenceDates, referenceLabel, "a"],
            [compareDates, compareLabel, "b"],
          ] as const) {
            const d = src?.get(task.id);
            if (d?.start && d.end) {
              ghostRefs.push({
                label,
                startISO: d.start,
                endISO: d.end,
                left: toX(d.start, rangeMin, dayWidth),
                width: getBarWidth(d.start, d.end, dayWidth),
                tone,
              });
            }
          }
          const locked = lockedTaskIds.has(task.id);

          return (
            <div
              key={vr.row.id}
              data-gantt-task={task.id}
              onMouseDown={(e) =>
                onSelectRow(vr.row.id, {
                  additive: e.ctrlKey || e.metaKey,
                  range: e.shiftKey,
                })
              }
              className={cn(
                "absolute inset-x-0 border-b border-border/30 transition-colors hover:bg-muted/10",
                selectedTaskIds.has(task.id) && "bg-primary/5",
                locked && "bg-amber-50/40",
              )}
              style={{ top, height: rowHeight }}
            >
              {task.is_milestone ? (
                <GanttMilestone
                  left={x}
                  name={task.task_name}
                  date={task.start_date ?? undefined}
                  onClick={() => onSelectRow(vr.row.id)}
                  onStartLink={locked || readOnly ? undefined : (e) => onStartLink(task.id, e)}
                />
              ) : (
                <GanttBar
                  task={g}
                  left={x}
                  width={w}
                  dayWidth={dayWidth}
                  onClick={() => onSelectRow(vr.row.id)}
                  onReschedule={locked || readOnly ? undefined : (id, s, f) => onReschedule(id, s, f)}
                  onStartLink={locked || readOnly ? undefined : (e) => onStartLink(task.id, e)}
                  onSetProgress={locked || readOnly ? undefined : onSetProgress}
                  zoom={zoom}
                  rangeMin={rangeMin}
                  highlightCritical={showCritical}
                  references={ghostRefs.length ? ghostRefs : undefined}
                  formatDate={formatDate}
                  barStyle={barStyle}
                  onFormatBar={onFormatBar}
                  showFloat={showFloat}
                />
              )}
              {locked && (
                <Lock
                  className="pointer-events-none absolute left-1 top-1/2 h-3 w-3 -translate-y-1/2 text-amber-600"
                  aria-label="Locked — WBS backbone"
                />
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

        {/* MS-Project-style progress line — a zigzag through each row's actual % complete */}
        {showProgressLine && progressLineDate && progressLineStyle && onEditProgressLine && (
          <GanttProgressLine
            visibleRows={visibleRows}
            lineDate={progressLineDate}
            rangeMin={rangeMin}
            dayWidth={dayWidth}
            rowHeight={rowHeight}
            containerWidth={chartW}
            containerHeight={bodyHeight}
            style={progressLineStyle}
            onEdit={onEditProgressLine}
          />
        )}
      </div>
    </div>
  );
}
